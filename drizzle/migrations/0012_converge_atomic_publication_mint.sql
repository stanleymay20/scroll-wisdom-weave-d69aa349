-- Lovable Test convergence Phase 7: atomic verified-publication minting.
--
-- Final canonical function bodies only, plus explicit trigger wiring.
-- Requires phases 0006-0011. No data backfill and no historical replay.

ALTER TABLE public.publications
  ADD COLUMN IF NOT EXISTS release_request_key text;

CREATE UNIQUE INDEX IF NOT EXISTS publications_release_request_key_uq
  ON public.publications(work_id, release_request_key)
  WHERE release_request_key IS NOT NULL;

-- Final canonical definition: canonicalize_publication_snapshot_for_retry
CREATE OR REPLACE FUNCTION public.canonicalize_publication_snapshot_for_retry(p_snapshot jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
DECLARE
  v_snapshot jsonb := p_snapshot - 'scroll_edition_id' - 'frozen_at';
  v_key text;
  v_sorted jsonb;
BEGIN
  FOREACH v_key IN ARRAY ARRAY['rights_holders','rights','citations','identifiers']::text[] LOOP
    IF pg_catalog.jsonb_typeof(v_snapshot->v_key) = 'array' THEN
      SELECT COALESCE(pg_catalog.jsonb_agg(e.value ORDER BY e.value::text), '[]'::jsonb)
      INTO v_sorted
      FROM pg_catalog.jsonb_array_elements(v_snapshot->v_key) AS e(value);
      v_snapshot := pg_catalog.jsonb_set(v_snapshot, ARRAY[v_key], v_sorted, false);
    END IF;
  END LOOP;
  RETURN v_snapshot;
END;
$$;
REVOKE ALL ON FUNCTION public.canonicalize_publication_snapshot_for_retry(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canonicalize_publication_snapshot_for_retry(jsonb) TO service_role;

-- Final canonical definition: compute_publication_release_request_key
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
          'snapshot', public.canonicalize_publication_snapshot_for_retry(p_snapshot)
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

-- Final canonical definition: lock_book_isbn_assignments
CREATE OR REPLACE FUNCTION public.lock_book_isbn_assignments(p_book_id uuid, p_publication_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_publication public.publications%ROWTYPE;
  v_identifier jsonb;
  v_assignment public.book_isbn_assignments%ROWTYPE;
  v_inventory public.isbn_inventory%ROWTYPE;
  v_count integer := 0;
  v_isbn text;
BEGIN
  SELECT p.* INTO v_publication
  FROM public.publications AS p
  WHERE p.id = p_publication_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PUBLICATION_NOT_FOUND' USING ERRCODE='P0002';
  END IF;
  IF v_publication.book_id IS DISTINCT FROM p_book_id THEN
    RAISE EXCEPTION 'PUBLICATION_BOOK_MISMATCH' USING ERRCODE='23514';
  END IF;
  IF v_publication.status NOT IN ('approved','published') THEN
    RAISE EXCEPTION 'PUBLICATION_NOT_LOCKABLE' USING ERRCODE='23514';
  END IF;

  FOR v_identifier IN
    SELECT value
    FROM pg_catalog.jsonb_array_elements(COALESCE(v_publication.snapshot->'identifiers', '[]'::jsonb))
  LOOP
    IF v_identifier->>'scheme' <> 'ISBN-13' THEN
      CONTINUE;
    END IF;
    v_isbn := public.normalize_isbn13(COALESCE(v_identifier->>'value', ''));
    IF NOT public.is_valid_isbn13(v_isbn) THEN
      RAISE EXCEPTION 'PUBLICATION_SNAPSHOT_INVALID_ISBN' USING ERRCODE='23514';
    END IF;

    SELECT ii.* INTO v_inventory
    FROM public.isbn_inventory AS ii
    WHERE ii.isbn13 = v_isbn
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PUBLICATION_SNAPSHOT_ISBN_ASSIGNMENT_MISSING:%', v_isbn USING ERRCODE='23514';
    END IF;

    SELECT bia.* INTO v_assignment
    FROM public.book_isbn_assignments AS bia
    WHERE bia.book_id = p_book_id
      AND bia.isbn_id = v_inventory.id
      AND bia.product_form = v_identifier->>'product_form'
      AND bia.language = v_identifier->>'language'
      AND bia.edition_label = v_identifier->>'edition_label'
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PUBLICATION_SNAPSHOT_ISBN_ASSIGNMENT_MISSING:%', v_isbn USING ERRCODE='23514';
    END IF;
    IF v_inventory.provenance_status <> 'verified' THEN
      RAISE EXCEPTION 'PUBLICATION_SNAPSHOT_ISBN_PROVENANCE_UNVERIFIED:%', v_isbn USING ERRCODE='23514';
    END IF;
    IF v_assignment.locked_publication_id IS NOT NULL AND v_assignment.locked_publication_id <> p_publication_id THEN
      RAISE EXCEPTION 'ISBN_ASSIGNMENT_ALREADY_LOCKED_TO_OTHER_PUBLICATION' USING ERRCODE='23514';
    END IF;

    UPDATE public.book_isbn_assignments AS bia
    SET locked_at = COALESCE(bia.locked_at, pg_catalog.now()),
        locked_publication_id = COALESCE(bia.locked_publication_id, p_publication_id)
    WHERE bia.id = v_assignment.id;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.lock_book_isbn_assignments(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lock_book_isbn_assignments(uuid,uuid) TO service_role;

-- Final canonical definition: finalize_publication_release
CREATE OR REPLACE FUNCTION public.finalize_publication_release(
  p_publication_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_publication public.publications%ROWTYPE;
  v_certificate public.publication_certificates%ROWTYPE;
  v_published_at timestamptz;
  v_scroll_identity jsonb;
  v_locked integer;
BEGIN
  SELECT p.* INTO v_publication
  FROM public.publications AS p
  WHERE p.id = p_publication_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PUBLICATION_NOT_FOUND' USING ERRCODE='P0002';
  END IF;
  IF v_publication.published_by IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'PUBLICATION_FINALIZER_USER_MISMATCH' USING ERRCODE='42501';
  END IF;
  IF v_publication.book_id IS NULL THEN
    RAISE EXCEPTION 'PUBLICATION_BOOK_REQUIRED' USING ERRCODE='23514';
  END IF;
  IF v_publication.content_hash IS NULL OR pg_catalog.length(v_publication.content_hash) <> 64 THEN
    RAISE EXCEPTION 'PUBLICATION_CONTENT_HASH_REQUIRED' USING ERRCODE='23514';
  END IF;

  IF v_publication.status = 'published' THEN
    SELECT pc.* INTO v_certificate
    FROM public.publication_certificates AS pc
    WHERE pc.publication_id = v_publication.id;
    v_scroll_identity := public.materialize_scroll_publication_identity(v_publication.id);
    RETURN pg_catalog.jsonb_build_object(
      'publication_id', v_publication.id,
      'certificate_id', v_certificate.id,
      'published_at', v_publication.published_at,
      'scroll_identity', v_scroll_identity,
      'idempotent', true
    );
  END IF;
  IF v_publication.status <> 'approved' THEN
    RAISE EXCEPTION 'PUBLICATION_NOT_APPROVED' USING ERRCODE='23514';
  END IF;

  v_locked := public.lock_book_isbn_assignments(v_publication.book_id, v_publication.id);
  v_scroll_identity := public.materialize_scroll_publication_identity(v_publication.id);

  INSERT INTO public.publication_certificates(
    publication_id, work_id, authors_snapshot, rights_holders_snapshot,
    content_hash, signature_algorithm, signature_value, public_key_id, issuer
  ) VALUES (
    v_publication.id,
    v_publication.work_id,
    COALESCE(v_publication.snapshot->'authors', '[]'::jsonb),
    COALESCE(v_publication.snapshot->'rights_holders', '[]'::jsonb),
    v_publication.content_hash,
    'sha256',
    v_publication.content_hash,
    'phase1-hash-only',
    'scrolllibrary'
  )
  ON CONFLICT (publication_id) DO NOTHING;

  SELECT pc.* INTO v_certificate
  FROM public.publication_certificates AS pc
  WHERE pc.publication_id = v_publication.id
  FOR UPDATE;
  IF NOT FOUND OR v_certificate.content_hash <> v_publication.content_hash THEN
    RAISE EXCEPTION 'PUBLICATION_CERTIFICATE_MISMATCH' USING ERRCODE='23514';
  END IF;

  v_published_at := pg_catalog.now();
  UPDATE public.publications AS p
  SET status = 'published',
      published_at = v_published_at,
      certificate_id = v_certificate.id
  WHERE p.id = v_publication.id AND p.status = 'approved';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PUBLICATION_FINALIZE_RACE' USING ERRCODE='40001';
  END IF;

  UPDATE public.works AS w
  SET current_publication_id = v_publication.id,
      publish_locked_at = v_published_at,
      publish_locked_by = p_user_id,
      publish_lock_reason = 'published'
  WHERE w.id = v_publication.work_id;

  UPDATE public.books AS b
  SET current_publication_id = v_publication.id,
      publish_locked_at = v_published_at,
      publish_locked_by = p_user_id
  WHERE b.id = v_publication.book_id;

  RETURN pg_catalog.jsonb_build_object(
    'publication_id', v_publication.id,
    'certificate_id', v_certificate.id,
    'published_at', v_published_at,
    'scroll_identity', v_scroll_identity,
    'locked_isbn_count', v_locked,
    'idempotent', false
  );
END;
$$;
REVOKE ALL ON FUNCTION public.finalize_publication_release(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_publication_release(uuid,uuid) TO service_role;

-- Final canonical definition: tg_set_publication_release_request_key
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

-- Final canonical definition: tg_publications_enforce_immutability
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

-- Final canonical definition: tg_validate_verified_publication_snapshot_consistency
CREATE OR REPLACE FUNCTION public.tg_validate_verified_publication_snapshot_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_identifier jsonb;
  v_map jsonb := '{}'::jsonb;
  v_form text;
  v_isbn text;
  v_print_isbn text;
BEGIN
  IF NEW.integrity_level::text <> 'verified_published' THEN
    RETURN NEW;
  END IF;

  IF NEW.snapshot IS NULL OR pg_catalog.jsonb_typeof(NEW.snapshot) <> 'object' THEN
    RAISE EXCEPTION 'PUBLICATION_SNAPSHOT_REQUIRED' USING ERRCODE = '23514';
  END IF;
  IF NEW.snapshot->>'scroll_edition_id' IS DISTINCT FROM NEW.scroll_edition_id THEN
    RAISE EXCEPTION 'PUBLICATION_SCROLL_EDITION_SNAPSHOT_MISMATCH' USING ERRCODE = '23514';
  END IF;
  IF NEW.snapshot->>'language' IS DISTINCT FROM NEW.language THEN
    RAISE EXCEPTION 'PUBLICATION_LANGUAGE_SNAPSHOT_MISMATCH' USING ERRCODE = '23514';
  END IF;
  IF NEW.snapshot->>'publisher_name' IS DISTINCT FROM NEW.snapshot->'publisher'->>'publisher_name'
     OR NEW.snapshot->>'publisher_imprint' IS DISTINCT FROM NEW.snapshot->'publisher'->>'imprint_name' THEN
    RAISE EXCEPTION 'PUBLICATION_PUBLISHER_COMPATIBILITY_FIELDS_MISMATCH' USING ERRCODE = '23514';
  END IF;

  IF pg_catalog.jsonb_typeof(COALESCE(NEW.snapshot->'identifiers', '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'PUBLICATION_IDENTIFIERS_INVALID' USING ERRCODE = '23514';
  END IF;
  IF pg_catalog.jsonb_typeof(COALESCE(NEW.snapshot->'isbn_by_format', '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'PUBLICATION_ISBN_BY_FORMAT_INVALID' USING ERRCODE = '23514';
  END IF;

  FOR v_identifier IN
    SELECT value
    FROM pg_catalog.jsonb_array_elements(COALESCE(NEW.snapshot->'identifiers', '[]'::jsonb))
  LOOP
    IF v_identifier->>'scheme' <> 'ISBN-13' THEN
      CONTINUE;
    END IF;
    v_form := v_identifier->>'product_form';
    v_isbn := public.normalize_isbn13(COALESCE(v_identifier->>'value', ''));
    IF pg_catalog.length(COALESCE(v_form, '')) = 0 OR NOT public.is_valid_isbn13(v_isbn) THEN
      RAISE EXCEPTION 'PUBLICATION_IDENTIFIER_INVALID' USING ERRCODE = '23514';
    END IF;
    IF v_map ? v_form AND v_map->>v_form IS DISTINCT FROM v_isbn THEN
      RAISE EXCEPTION 'PUBLICATION_DUPLICATE_PRODUCT_FORM_ISBN:%', v_form USING ERRCODE = '23514';
    END IF;
    v_map := v_map || pg_catalog.jsonb_build_object(v_form, v_isbn);
  END LOOP;

  IF COALESCE(NEW.snapshot->'isbn_by_format', '{}'::jsonb) IS DISTINCT FROM v_map THEN
    RAISE EXCEPTION 'PUBLICATION_ISBN_BY_FORMAT_MISMATCH' USING ERRCODE = '23514';
  END IF;

  v_print_isbn := COALESCE(v_map->>'paperback', v_map->>'hardcover');
  IF NEW.snapshot->>'isbn' IS DISTINCT FROM v_print_isbn
     OR NEW.snapshot->>'isbn_13' IS DISTINCT FROM v_print_isbn THEN
    RAISE EXCEPTION 'PUBLICATION_LEGACY_PRINT_ISBN_MISMATCH' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_validate_verified_publication_snapshot_consistency() FROM PUBLIC, anon, authenticated;

-- Final canonical definition: tg_finalize_verified_publication_insert
CREATE OR REPLACE FUNCTION public.tg_finalize_verified_publication_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile public.book_publishing_profiles%ROWTYPE;
  v_imprint public.publishing_imprints%ROWTYPE;
  v_publisher jsonb;
  v_identifier jsonb;
  v_isbn text;
  v_expected_source text;
BEGIN
  IF NEW.status = 'approved'
     AND NEW.integrity_level::text = 'verified_published'
     AND NEW.book_id IS NOT NULL
     AND NEW.published_by IS NOT NULL
     AND NEW.content_hash IS NOT NULL
     AND NEW.snapshot IS NOT NULL
     AND NEW.snapshot ? 'publication_trust' THEN

    IF NEW.content_hash !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'PUBLICATION_CONTENT_HASH_INVALID' USING ERRCODE = '23514';
    END IF;

    SELECT bpp.* INTO v_profile
    FROM public.book_publishing_profiles AS bpp
    WHERE bpp.book_id = NEW.book_id
      AND bpp.owner_user_id = NEW.published_by
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PUBLISHING_IDENTITY_REQUIRED' USING ERRCODE = '23514';
    END IF;

    IF NEW.snapshot->>'print_identifier_strategy' IS DISTINCT FROM v_profile.print_identifier_strategy::text
       OR NEW.snapshot->>'ebook_identifier_strategy' IS DISTINCT FROM v_profile.ebook_identifier_strategy::text
       OR NEW.snapshot->>'distribution_scope' IS DISTINCT FROM v_profile.distribution_scope::text
       OR NEW.snapshot->>'edition' IS DISTINCT FROM v_profile.edition_label
       OR NEW.language IS DISTINCT FROM v_profile.publication_language THEN
      RAISE EXCEPTION 'PUBLICATION_PROFILE_SNAPSHOT_STALE' USING ERRCODE = '23514';
    END IF;

    v_publisher := NEW.snapshot->'publisher';
    IF pg_catalog.jsonb_typeof(v_publisher) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'PUBLICATION_PUBLISHER_SNAPSHOT_REQUIRED' USING ERRCODE = '23514';
    END IF;
    IF v_publisher->>'mode' IS DISTINCT FROM v_profile.publisher_mode::text THEN
      RAISE EXCEPTION 'PUBLICATION_PUBLISHER_MODE_STALE' USING ERRCODE = '23514';
    END IF;

    IF pg_catalog.jsonb_typeof(COALESCE(NEW.snapshot->'identifiers', '[]'::jsonb)) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'PUBLICATION_IDENTIFIERS_INVALID' USING ERRCODE = '23514';
    END IF;

    IF v_profile.publisher_mode::text = 'kdp_independent' THEN
      IF v_profile.print_identifier_strategy::text <> 'kdp_free'
         OR v_profile.distribution_scope::text <> 'kdp_only'
         OR v_profile.imprint_id IS NOT NULL
         OR v_publisher->>'verification' IS DISTINCT FROM 'kdp_free_isbn_at_submission'
         OR pg_catalog.jsonb_array_length(COALESCE(NEW.snapshot->'identifiers', '[]'::jsonb)) <> 0 THEN
        RAISE EXCEPTION 'KDP_FREE_PUBLICATION_IDENTITY_INVALID' USING ERRCODE = '23514';
      END IF;
    ELSE
      IF v_profile.imprint_id IS NULL THEN
        RAISE EXCEPTION 'PUBLISHER_IMPRINT_REQUIRED' USING ERRCODE = '23514';
      END IF;

      SELECT pi.* INTO v_imprint
      FROM public.publishing_imprints AS pi
      WHERE pi.id = v_profile.imprint_id
      FOR SHARE;
      IF NOT FOUND OR v_imprint.verified IS NOT TRUE OR v_imprint.verification_reference IS NULL THEN
        RAISE EXCEPTION 'VERIFIED_PUBLISHER_IMPRINT_REQUIRED' USING ERRCODE = '23514';
      END IF;
      IF v_profile.publisher_mode::text = 'own_imprint'
         AND (v_imprint.scope <> 'user' OR v_imprint.owner_user_id IS DISTINCT FROM NEW.published_by) THEN
        RAISE EXCEPTION 'VERIFIED_USER_IMPRINT_REQUIRED' USING ERRCODE = '23514';
      END IF;
      IF v_profile.publisher_mode::text = 'platform_imprint' AND v_imprint.scope <> 'platform' THEN
        RAISE EXCEPTION 'VERIFIED_PLATFORM_IMPRINT_REQUIRED' USING ERRCODE = '23514';
      END IF;

      IF v_publisher->>'imprint_id' IS DISTINCT FROM v_imprint.id::text
         OR v_publisher->>'publisher_name' IS DISTINCT FROM v_imprint.publisher_name
         OR v_publisher->>'imprint_name' IS DISTINCT FROM v_imprint.imprint_name
         OR v_publisher->>'country_code' IS DISTINCT FROM v_imprint.country_code
         OR v_publisher->>'isbn_agency_name' IS DISTINCT FROM v_imprint.isbn_agency_name
         OR v_publisher->>'registrant_name' IS DISTINCT FROM v_imprint.registrant_name
         OR v_publisher->>'verification_reference' IS DISTINCT FROM v_imprint.verification_reference
         OR v_publisher->>'verification_method' IS DISTINCT FROM v_imprint.verification_method THEN
        RAISE EXCEPTION 'PUBLICATION_PUBLISHER_SNAPSHOT_STALE' USING ERRCODE = '23514';
      END IF;

      v_expected_source := CASE
        WHEN v_profile.publisher_mode::text = 'own_imprint' THEN 'publisher_owned'
        ELSE 'platform_pool'
      END;

      FOR v_identifier IN
        SELECT value
        FROM pg_catalog.jsonb_array_elements(COALESCE(NEW.snapshot->'identifiers', '[]'::jsonb))
      LOOP
        IF v_identifier->>'scheme' <> 'ISBN-13' THEN
          CONTINUE;
        END IF;
        v_isbn := public.normalize_isbn13(COALESCE(v_identifier->>'value', ''));
        IF NOT public.is_valid_isbn13(v_isbn) THEN
          RAISE EXCEPTION 'PUBLICATION_SNAPSHOT_INVALID_ISBN' USING ERRCODE = '23514';
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM public.book_isbn_assignments AS bia
          JOIN public.isbn_inventory AS ii ON ii.id = bia.isbn_id
          WHERE bia.book_id = NEW.book_id
            AND bia.product_form = v_identifier->>'product_form'
            AND bia.language = v_identifier->>'language'
            AND bia.edition_label = v_identifier->>'edition_label'
            AND ii.isbn13 = v_isbn
            AND ii.imprint_id = v_profile.imprint_id
            AND ii.source = v_expected_source
            AND ii.provenance_status = 'verified'
            AND ii.provenance_reference IS NOT NULL
            AND (v_profile.publisher_mode::text <> 'own_imprint' OR ii.claimed_by_user_id = NEW.published_by)
            AND v_identifier->>'source' = ii.source
            AND v_identifier->>'provenance_status' = ii.provenance_status
            AND v_identifier->>'provenance_reference' = ii.provenance_reference
        ) THEN
          RAISE EXCEPTION 'PUBLICATION_SNAPSHOT_ISBN_IDENTITY_STALE:%', v_isbn USING ERRCODE = '23514';
        END IF;
      END LOOP;
    END IF;

    PERFORM public.finalize_publication_release(NEW.id, NEW.published_by);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_finalize_verified_publication_insert() FROM PUBLIC, anon, authenticated;

-- Final canonical definition: mint_verified_publication_release
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

DROP TRIGGER IF EXISTS trg_publications_immutability
  ON public.publications;
CREATE TRIGGER trg_publications_immutability
BEFORE UPDATE ON public.publications
FOR EACH ROW
EXECUTE FUNCTION public.tg_publications_enforce_immutability();

DROP TRIGGER IF EXISTS trg_set_publication_release_request_key
  ON public.publications;
CREATE TRIGGER trg_set_publication_release_request_key
BEFORE INSERT ON public.publications
FOR EACH ROW
EXECUTE FUNCTION public.tg_set_publication_release_request_key();

DROP TRIGGER IF EXISTS trg_validate_verified_publication_snapshot_consistency
  ON public.publications;
CREATE TRIGGER trg_validate_verified_publication_snapshot_consistency
BEFORE INSERT ON public.publications
FOR EACH ROW
EXECUTE FUNCTION public.tg_validate_verified_publication_snapshot_consistency();

DROP TRIGGER IF EXISTS trg_finalize_verified_publication_insert
  ON public.publications;
CREATE TRIGGER trg_finalize_verified_publication_insert
AFTER INSERT ON public.publications
FOR EACH ROW
EXECUTE FUNCTION public.tg_finalize_verified_publication_insert();
