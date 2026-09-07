-- Close residual ISBN-governance and publication retry gaps found during the
-- forensic review of PR #13.
--
-- Invariants added here:
--   * verified imprint identity cannot drift after ISBN inventory is attached;
--   * changing identity before inventory exists invalidates any prior review;
--   * platform ISBN verification batches cannot overlap or silently re-verify
--     an already registered ISBN;
--   * batch approval re-checks the platform imprint and exact batch membership;
--   * verified publication minting is database-owned, serialized per Work, and
--     idempotent for the same frozen publishing state.

-- ---------------------------------------------------------------------------
-- Publisher/imprint identity drift hardening
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_imprint_identity_drift()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_identity_changed boolean :=
    NEW.scope IS DISTINCT FROM OLD.scope
    OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id
    OR NEW.publisher_name IS DISTINCT FROM OLD.publisher_name
    OR NEW.imprint_name IS DISTINCT FROM OLD.imprint_name
    OR NEW.country_code IS DISTINCT FROM OLD.country_code
    OR NEW.isbn_agency_name IS DISTINCT FROM OLD.isbn_agency_name
    OR NEW.registrant_name IS DISTINCT FROM OLD.registrant_name;
BEGIN
  IF v_identity_changed THEN
    IF EXISTS (
      SELECT 1
      FROM public.isbn_inventory AS ii
      WHERE ii.imprint_id = OLD.id
    ) THEN
      RAISE EXCEPTION 'IMPRINT_IDENTITY_LOCKED: verified publisher/registrant identity cannot change after ISBN inventory is attached'
        USING ERRCODE = '23514';
    END IF;

    -- Any identity edit made before ISBN inventory exists must return to a
    -- pending/unverified state. A previous review cannot authorize new facts.
    NEW.verified := false;
    NEW.verified_at := NULL;
    NEW.verified_by := NULL;
    NEW.verification_reference := NULL;
    NEW.verification_method := NULL;
    NEW.verification_pending_reference := NULL;
    NEW.verification_pending_method := NULL;
    NEW.verification_pending_notes := NULL;
    NEW.verification_submitted_by := NULL;
    NEW.verification_submitted_at := NULL;
  ELSIF NEW.agency_record_attested IS DISTINCT FROM OLD.agency_record_attested
        AND NEW.agency_record_attested IS NOT TRUE THEN
    -- Revocation must always be possible, even after inventory exists.
    NEW.verified := false;
    NEW.verified_at := NULL;
    NEW.verified_by := NULL;
    NEW.verification_reference := NULL;
    NEW.verification_method := NULL;
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.prevent_imprint_identity_drift() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Platform ISBN pool batches: no overlapping pending batches, no silent
-- re-verification of already-registered ISBNs, and approval re-validates state.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_platform_isbn_pool_batch(
  p_admin_user_id uuid,
  p_imprint_id uuid,
  p_isbns text[],
  p_provenance_reference text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_imprint public.publishing_imprints%ROWTYPE;
  v_batch_id uuid;
  v_raw text;
  v_isbn text;
  v_numbers text[] := ARRAY[]::text[];
  v_existing public.isbn_inventory%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles AS ur
    WHERE ur.user_id = p_admin_user_id AND ur.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF pg_catalog.length(pg_catalog.btrim(COALESCE(p_provenance_reference, ''))) = 0 THEN
    RAISE EXCEPTION 'PROVENANCE_REFERENCE_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(pg_catalog.array_length(p_isbns, 1), 0) = 0 THEN
    RAISE EXCEPTION 'ISBN_BATCH_EMPTY' USING ERRCODE = '22023';
  END IF;

  SELECT pi.* INTO v_imprint
  FROM public.publishing_imprints AS pi
  WHERE pi.id = p_imprint_id
  FOR UPDATE;
  IF NOT FOUND OR v_imprint.scope <> 'platform'
     OR v_imprint.verified IS NOT TRUE
     OR v_imprint.verification_reference IS NULL THEN
    RAISE EXCEPTION 'VERIFIED_PLATFORM_IMPRINT_REQUIRED' USING ERRCODE = '23514';
  END IF;

  FOREACH v_raw IN ARRAY p_isbns LOOP
    v_isbn := public.normalize_isbn13(v_raw);
    IF NOT public.is_valid_isbn13(v_isbn) THEN
      RAISE EXCEPTION 'INVALID_ISBN13:%', v_raw USING ERRCODE = '22023';
    END IF;
    IF v_isbn = ANY(v_numbers) THEN
      RAISE EXCEPTION 'DUPLICATE_ISBN_IN_BATCH:%', v_isbn USING ERRCODE = '23505';
    END IF;
    v_numbers := pg_catalog.array_append(v_numbers, v_isbn);
  END LOOP;

  INSERT INTO public.platform_isbn_pool_verification_batches(
    imprint_id, provenance_reference, submitted_by, isbn_count
  ) VALUES (
    p_imprint_id,
    pg_catalog.btrim(p_provenance_reference),
    p_admin_user_id,
    pg_catalog.array_length(v_numbers, 1)
  )
  RETURNING id INTO v_batch_id;

  FOREACH v_isbn IN ARRAY v_numbers LOOP
    SELECT ii.* INTO v_existing
    FROM public.isbn_inventory AS ii
    WHERE ii.isbn13 = v_isbn
    FOR UPDATE;

    IF FOUND THEN
      -- Re-submission is allowed only after a prior evidence review rejected
      -- this same platform ISBN. Verified, assigned, or already-pending rows are
      -- immutable from the submission path.
      IF v_existing.imprint_id <> p_imprint_id
         OR v_existing.source <> 'platform_pool'
         OR v_existing.status <> 'available'
         OR v_existing.provenance_status <> 'rejected'
         OR v_existing.claimed_by_user_id IS NOT NULL THEN
        RAISE EXCEPTION 'ISBN_ALREADY_REGISTERED:%', v_isbn USING ERRCODE = '23505';
      END IF;

      UPDATE public.isbn_inventory AS ii
      SET provenance_status = 'unverified',
          provenance_reference = pg_catalog.btrim(p_provenance_reference),
          provenance_verified_at = NULL,
          provenance_verified_by = NULL,
          provenance_batch_id = v_batch_id
      WHERE ii.id = v_existing.id;
    ELSE
      INSERT INTO public.isbn_inventory(
        imprint_id, isbn13, source, status, added_by,
        provenance_status, provenance_reference, provenance_verified_at,
        provenance_verified_by, claimed_by_user_id, provenance_batch_id
      ) VALUES (
        p_imprint_id, v_isbn, 'platform_pool', 'available', p_admin_user_id,
        'unverified', pg_catalog.btrim(p_provenance_reference), NULL,
        NULL, NULL, v_batch_id
      );
    END IF;
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'batch_id', v_batch_id,
    'status', 'pending',
    'isbn_count', pg_catalog.array_length(v_numbers, 1),
    'provenance_reference', pg_catalog.btrim(p_provenance_reference)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.submit_platform_isbn_pool_batch(uuid,uuid,text[],text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_platform_isbn_pool_batch(uuid,uuid,text[],text) TO service_role;

CREATE OR REPLACE FUNCTION public.review_platform_isbn_pool_batch(
  p_admin_user_id uuid,
  p_batch_id uuid,
  p_approved boolean,
  p_review_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_batch public.platform_isbn_pool_verification_batches%ROWTYPE;
  v_imprint public.publishing_imprints%ROWTYPE;
  v_now timestamptz := pg_catalog.now();
  v_status text := CASE WHEN p_approved THEN 'verified' ELSE 'rejected' END;
  v_member_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles AS ur
    WHERE ur.user_id = p_admin_user_id AND ur.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT b.* INTO v_batch
  FROM public.platform_isbn_pool_verification_batches AS b
  WHERE b.id = p_batch_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ISBN_POOL_BATCH_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_batch.status <> 'pending' THEN
    RETURN pg_catalog.jsonb_build_object(
      'batch_id', v_batch.id,
      'status', v_batch.status,
      'idempotent', true
    );
  END IF;

  SELECT pi.* INTO v_imprint
  FROM public.publishing_imprints AS pi
  WHERE pi.id = v_batch.imprint_id
  FOR UPDATE;
  IF NOT FOUND OR v_imprint.scope <> 'platform'
     OR v_imprint.verified IS NOT TRUE
     OR v_imprint.verification_reference IS NULL THEN
    RAISE EXCEPTION 'VERIFIED_PLATFORM_IMPRINT_REQUIRED' USING ERRCODE = '23514';
  END IF;

  SELECT pg_catalog.count(*)::integer INTO v_member_count
  FROM public.isbn_inventory AS ii
  WHERE ii.provenance_batch_id = p_batch_id;
  IF v_member_count <> v_batch.isbn_count THEN
    RAISE EXCEPTION 'ISBN_POOL_BATCH_MEMBERSHIP_MISMATCH' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.isbn_inventory AS ii
    WHERE ii.provenance_batch_id = p_batch_id
      AND (
        ii.imprint_id <> v_batch.imprint_id
        OR ii.source <> 'platform_pool'
        OR ii.status <> 'available'
        OR ii.provenance_status <> 'unverified'
        OR ii.provenance_reference IS DISTINCT FROM v_batch.provenance_reference
        OR ii.claimed_by_user_id IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'ISBN_POOL_BATCH_STATE_INVALID' USING ERRCODE = '23514';
  END IF;

  UPDATE public.isbn_inventory AS ii
  SET provenance_status = CASE WHEN p_approved THEN 'verified' ELSE 'rejected' END,
      provenance_verified_at = CASE WHEN p_approved THEN v_now ELSE NULL END,
      provenance_verified_by = CASE WHEN p_approved THEN p_admin_user_id ELSE NULL END
  WHERE ii.provenance_batch_id = p_batch_id;

  UPDATE public.platform_isbn_pool_verification_batches AS b
  SET status = v_status,
      reviewed_by = p_admin_user_id,
      reviewed_at = v_now,
      review_notes = p_review_notes
  WHERE b.id = p_batch_id;

  RETURN pg_catalog.jsonb_build_object(
    'batch_id', p_batch_id,
    'status', v_status,
    'isbn_count', v_batch.isbn_count,
    'reviewed_at', v_now,
    'idempotent', false
  );
END;
$$;
REVOKE ALL ON FUNCTION public.review_platform_isbn_pool_batch(uuid,uuid,boolean,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_platform_isbn_pool_batch(uuid,uuid,boolean,text) TO service_role;

-- ---------------------------------------------------------------------------
-- Publication mint idempotency and serialized version allocation.
-- The request key hashes the complete frozen snapshot except for the two
-- intentionally volatile values generated for a new release attempt.
-- ---------------------------------------------------------------------------
ALTER TABLE public.publications
  ADD COLUMN IF NOT EXISTS release_request_key text;

CREATE UNIQUE INDEX IF NOT EXISTS publications_release_request_key_uq
  ON public.publications(work_id, release_request_key)
  WHERE release_request_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.compute_publication_release_request_key(
  p_work_id uuid,
  p_book_id uuid,
  p_edition_kind public.publication_edition_kind,
  p_language text,
  p_snapshot jsonb
)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
  SELECT pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'work_id', p_work_id,
          'book_id', p_book_id,
          'edition_kind', p_edition_kind::text,
          'language', p_language,
          'snapshot', p_snapshot - 'scroll_edition_id' - 'frozen_at'
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
$$;
REVOKE ALL ON FUNCTION public.compute_publication_release_request_key(uuid,uuid,public.publication_edition_kind,text,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_publication_release_request_key(uuid,uuid,public.publication_edition_kind,text,jsonb)
  TO service_role;

CREATE OR REPLACE FUNCTION public.tg_set_publication_release_request_key()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_expected text;
BEGIN
  IF NEW.integrity_level::text = 'verified_published'
     AND NEW.book_id IS NOT NULL
     AND NEW.snapshot IS NOT NULL
     AND NEW.snapshot ? 'publication_trust' THEN
    v_expected := public.compute_publication_release_request_key(
      NEW.work_id,
      NEW.book_id,
      NEW.edition_kind,
      NEW.language,
      NEW.snapshot
    );
    IF NEW.release_request_key IS NOT NULL
       AND NEW.release_request_key IS DISTINCT FROM v_expected THEN
      RAISE EXCEPTION 'PUBLICATION_RELEASE_REQUEST_KEY_MISMATCH' USING ERRCODE = '23514';
    END IF;
    NEW.release_request_key := v_expected;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_set_publication_release_request_key() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_set_publication_release_request_key ON public.publications;
CREATE TRIGGER trg_set_publication_release_request_key
BEFORE INSERT ON public.publications
FOR EACH ROW EXECUTE FUNCTION public.tg_set_publication_release_request_key();

-- Keep the release-request identity immutable along with the rest of a
-- published Publication's certified identity.
CREATE OR REPLACE FUNCTION public.tg_publications_enforce_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.status = 'published' AND NEW.status = 'published' THEN
    IF NEW.snapshot IS DISTINCT FROM OLD.snapshot
       OR NEW.design_snapshot IS DISTINCT FROM OLD.design_snapshot
       OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
       OR NEW.version IS DISTINCT FROM OLD.version
       OR NEW.edition_kind IS DISTINCT FROM OLD.edition_kind
       OR NEW.language IS DISTINCT FROM OLD.language
       OR NEW.work_id IS DISTINCT FROM OLD.work_id
       OR NEW.book_id IS DISTINCT FROM OLD.book_id
       OR NEW.release_request_key IS DISTINCT FROM OLD.release_request_key THEN
      RAISE EXCEPTION 'PUBLICATION_IMMUTABLE' USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_publications_enforce_immutability() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.mint_verified_publication_release(
  p_user_id uuid,
  p_work_id uuid,
  p_book_id uuid,
  p_scroll_edition_id text,
  p_edition_kind public.publication_edition_kind,
  p_language text,
  p_snapshot jsonb,
  p_design_snapshot jsonb,
  p_content_hash text,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_work public.works%ROWTYPE;
  v_book public.books%ROWTYPE;
  v_profile public.book_publishing_profiles%ROWTYPE;
  v_imprint public.publishing_imprints%ROWTYPE;
  v_publication public.publications%ROWTYPE;
  v_request_key text;
  v_scope_hash text;
  v_current_scope_hash text;
  v_gate text;
  v_major integer := 1;
  v_minor integer := 0;
  v_patch integer := 0;
  v_version text;
  v_final jsonb;
BEGIN
  IF pg_catalog.length(COALESCE(p_content_hash, '')) <> 64 THEN
    RAISE EXCEPTION 'PUBLICATION_CONTENT_HASH_REQUIRED' USING ERRCODE = '23514';
  END IF;
  IF pg_catalog.length(pg_catalog.btrim(COALESCE(p_language, ''))) = 0 THEN
    RAISE EXCEPTION 'PUBLICATION_LANGUAGE_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.length(pg_catalog.btrim(COALESCE(p_scroll_edition_id, ''))) = 0
     OR p_scroll_edition_id NOT LIKE 'SLE-%' THEN
    RAISE EXCEPTION 'SCROLL_EDITION_ID_REQUIRED' USING ERRCODE = '23514';
  END IF;
  IF p_snapshot IS NULL OR p_snapshot ? 'publication_trust' IS NOT TRUE THEN
    RAISE EXCEPTION 'PUBLICATION_TRUST_SNAPSHOT_REQUIRED' USING ERRCODE = '23514';
  END IF;

  v_scope_hash := p_snapshot->'publication_trust'->>'scope_hash';
  IF pg_catalog.length(COALESCE(v_scope_hash, '')) <> 64 THEN
    RAISE EXCEPTION 'PUBLICATION_SCOPE_HASH_REQUIRED' USING ERRCODE = '23514';
  END IF;

  SELECT w.* INTO v_work
  FROM public.works AS w
  WHERE w.id = p_work_id
  FOR UPDATE;
  IF NOT FOUND OR v_work.created_by IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'PUBLICATION_WORK_OWNER_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT b.* INTO v_book
  FROM public.books AS b
  WHERE b.id = p_book_id
  FOR UPDATE;
  IF NOT FOUND OR v_book.work_id IS DISTINCT FROM p_work_id
     OR (v_book.user_id IS DISTINCT FROM p_user_id AND v_book.creator_id IS DISTINCT FROM p_user_id) THEN
    RAISE EXCEPTION 'PUBLICATION_BOOK_OWNER_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF p_snapshot->>'scroll_work_id' IS DISTINCT FROM v_work.scroll_work_id
     OR p_snapshot->>'scroll_edition_id' IS DISTINCT FROM p_scroll_edition_id THEN
    RAISE EXCEPTION 'PUBLICATION_SCROLL_IDENTITY_MISMATCH' USING ERRCODE = '23514';
  END IF;

  v_request_key := public.compute_publication_release_request_key(
    p_work_id, p_book_id, p_edition_kind, p_language, p_snapshot
  );

  -- Same frozen state returns the already-minted Publication. The Work lock
  -- serializes both duplicate retries and distinct concurrent release attempts.
  SELECT p.* INTO v_publication
  FROM public.publications AS p
  WHERE p.work_id = p_work_id
    AND p.release_request_key = v_request_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_publication.published_by IS DISTINCT FROM p_user_id
       OR v_publication.book_id IS DISTINCT FROM p_book_id THEN
      RAISE EXCEPTION 'PUBLICATION_RETRY_IDENTITY_MISMATCH' USING ERRCODE = '42501';
    END IF;
    v_final := public.finalize_publication_release(v_publication.id, p_user_id);
    RETURN v_final || pg_catalog.jsonb_build_object(
      'publication_id', v_publication.id,
      'version', v_publication.version,
      'content_hash', v_publication.content_hash,
      'scroll_edition_id', v_publication.scroll_edition_id,
      'release_request_key', v_request_key,
      'idempotent', true
    );
  END IF;

  -- Re-check the current authoritative book hash inside the mint transaction.
  v_current_scope_hash := public.compute_book_publication_hash(p_book_id);
  IF v_current_scope_hash IS DISTINCT FROM v_scope_hash THEN
    RAISE EXCEPTION 'PUBLICATION_SCOPE_HASH_STALE' USING ERRCODE = '40001';
  END IF;
  IF public.has_current_publication_attestations(p_book_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'PUBLICATION_ATTESTATIONS_STALE' USING ERRCODE = '23514';
  END IF;

  FOREACH v_gate IN ARRAY ARRAY['structural','rights','production']::text[] LOOP
    IF (
      SELECT pga.status::text
      FROM public.publication_gate_attestations AS pga
      WHERE pga.book_id = p_book_id
        AND pga.gate::text = v_gate
        AND pga.scope::text = 'book'
        AND pga.scope_hash = v_scope_hash
      ORDER BY pga.created_at DESC, pga.id DESC
      LIMIT 1
    ) IS DISTINCT FROM 'passed' THEN
      RAISE EXCEPTION 'PUBLICATION_GATE_STALE:%', v_gate USING ERRCODE = '23514';
    END IF;
  END LOOP;

  SELECT bpp.* INTO v_profile
  FROM public.book_publishing_profiles AS bpp
  WHERE bpp.book_id = p_book_id AND bpp.owner_user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PUBLISHING_IDENTITY_REQUIRED' USING ERRCODE = '23514';
  END IF;

  IF v_profile.publisher_mode = 'kdp_independent' THEN
    IF v_profile.print_identifier_strategy <> 'kdp_free'
       OR v_profile.distribution_scope <> 'kdp_only' THEN
      RAISE EXCEPTION 'INVALID_KDP_INDEPENDENT_PROFILE' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF v_profile.imprint_id IS NULL THEN
      RAISE EXCEPTION 'PUBLISHER_IMPRINT_REQUIRED' USING ERRCODE = '23514';
    END IF;
    SELECT pi.* INTO v_imprint
    FROM public.publishing_imprints AS pi
    WHERE pi.id = v_profile.imprint_id
    FOR UPDATE;
    IF NOT FOUND OR v_imprint.verified IS NOT TRUE OR v_imprint.verification_reference IS NULL THEN
      RAISE EXCEPTION 'VERIFIED_PUBLISHER_IMPRINT_REQUIRED' USING ERRCODE = '23514';
    END IF;
    IF v_profile.publisher_mode = 'own_imprint'
       AND (v_imprint.scope <> 'user' OR v_imprint.owner_user_id IS DISTINCT FROM p_user_id) THEN
      RAISE EXCEPTION 'VERIFIED_USER_IMPRINT_REQUIRED' USING ERRCODE = '23514';
    END IF;
    IF v_profile.publisher_mode = 'platform_imprint' AND v_imprint.scope <> 'platform' THEN
      RAISE EXCEPTION 'VERIFIED_PLATFORM_IMPRINT_REQUIRED' USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT p.semver_major, p.semver_minor, p.semver_patch
  INTO v_major, v_minor, v_patch
  FROM public.publications AS p
  WHERE p.work_id = p_work_id
  ORDER BY p.semver_major DESC, p.semver_minor DESC, p.semver_patch DESC, p.created_at DESC, p.id DESC
  LIMIT 1;

  IF NOT FOUND THEN
    v_major := 1;
    v_minor := 0;
    v_patch := 0;
  ELSE
    v_minor := v_minor + 1;
    v_patch := 0;
  END IF;
  v_version := v_major::text || '.' || v_minor::text || '.' || v_patch::text;

  INSERT INTO public.publications(
    work_id, book_id, scroll_edition_id, edition_kind, language,
    version, semver_major, semver_minor, semver_patch,
    status, integrity_level, snapshot, design_snapshot, content_hash,
    release_request_key, published_at, published_by, notes
  ) VALUES (
    p_work_id, p_book_id, p_scroll_edition_id, p_edition_kind, p_language,
    v_version, v_major, v_minor, v_patch,
    'approved', 'verified_published', p_snapshot, p_design_snapshot, p_content_hash,
    v_request_key, NULL, p_user_id, p_notes
  )
  RETURNING * INTO v_publication;

  -- The AFTER INSERT trigger finalizes inside this transaction. Call the
  -- finalizer again as an idempotent assertion/readback so this RPC stays safe
  -- even if the trigger is later refactored without weakening the contract.
  v_final := public.finalize_publication_release(v_publication.id, p_user_id);

  SELECT p.* INTO v_publication
  FROM public.publications AS p
  WHERE p.id = v_publication.id;

  RETURN v_final || pg_catalog.jsonb_build_object(
    'publication_id', v_publication.id,
    'version', v_publication.version,
    'content_hash', v_publication.content_hash,
    'scroll_edition_id', v_publication.scroll_edition_id,
    'release_request_key', v_request_key
  );
END;
$$;
REVOKE ALL ON FUNCTION public.mint_verified_publication_release(
  uuid,uuid,uuid,text,public.publication_edition_kind,text,jsonb,jsonb,text,text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mint_verified_publication_release(
  uuid,uuid,uuid,text,public.publication_edition_kind,text,jsonb,jsonb,text,text
) TO service_role;
