-- Lovable Test convergence Phase 5: ISBN governance operations.
--
-- Generated from the FINAL canonical function definitions already enforced by
-- the Supabase migration lineage. This migration only CREATE OR REPLACEs
-- governance RPCs and their explicit ACLs. It creates no historical rows and
-- replays no historical migration sequence.

-- Final canonical definition: submit_publishing_imprint_verification
CREATE OR REPLACE FUNCTION public.submit_publishing_imprint_verification(
  p_admin_user_id uuid,
  p_imprint_id uuid,
  p_verification_reference text,
  p_verification_method text DEFAULT 'manual_agency_record_review',
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_imprint public.publishing_imprints%ROWTYPE;
  v_now timestamptz := pg_catalog.now();
  v_is_admin boolean := false;
BEGIN
  IF pg_catalog.length(pg_catalog.btrim(COALESCE(p_verification_reference, ''))) = 0 THEN
    RAISE EXCEPTION 'VERIFICATION_REFERENCE_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.length(pg_catalog.btrim(COALESCE(p_verification_method, ''))) = 0 THEN
    RAISE EXCEPTION 'VERIFICATION_METHOD_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT pi.* INTO v_imprint
  FROM public.publishing_imprints AS pi
  WHERE pi.id = p_imprint_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'IMPRINT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles AS ur
    WHERE ur.user_id = p_admin_user_id AND ur.role = 'admin'
  ) INTO v_is_admin;

  IF v_imprint.scope = 'platform' THEN
    IF NOT v_is_admin THEN
      RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE = '42501';
    END IF;
  ELSIF v_imprint.scope = 'user' THEN
    IF v_imprint.owner_user_id IS DISTINCT FROM p_admin_user_id AND NOT v_is_admin THEN
      RAISE EXCEPTION 'IMPRINT_OWNER_OR_ADMIN_REQUIRED' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'UNSUPPORTED_IMPRINT_SCOPE' USING ERRCODE = '23514';
  END IF;

  UPDATE public.publishing_imprints AS pi
  SET verified = false,
      verified_at = NULL,
      verified_by = NULL,
      verification_reference = NULL,
      verification_method = NULL,
      verification_pending_reference = pg_catalog.btrim(p_verification_reference),
      verification_pending_method = pg_catalog.btrim(p_verification_method),
      verification_pending_notes = p_notes,
      verification_submitted_by = p_admin_user_id,
      verification_submitted_at = v_now
  WHERE pi.id = p_imprint_id;

  RETURN pg_catalog.jsonb_build_object(
    'imprint_id', p_imprint_id,
    'status', 'pending',
    'verified', false,
    'verification_reference', pg_catalog.btrim(p_verification_reference),
    'verification_method', pg_catalog.btrim(p_verification_method),
    'submitted_at', v_now
  );
END;
$$;
REVOKE ALL ON FUNCTION public.submit_publishing_imprint_verification(uuid,uuid,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_publishing_imprint_verification(uuid,uuid,text,text,text) TO service_role;

-- Final canonical definition: review_publishing_imprint
CREATE OR REPLACE FUNCTION public.review_publishing_imprint(
  p_admin_user_id uuid,
  p_imprint_id uuid,
  p_approved boolean,
  p_verification_reference text,
  p_notes text DEFAULT NULL,
  p_verification_method text DEFAULT 'manual_agency_record_review'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_imprint public.publishing_imprints%ROWTYPE;
  v_status text := CASE WHEN p_approved THEN 'verified' ELSE 'rejected' END;
  v_now timestamptz := pg_catalog.now();
  v_reference text;
  v_method text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles AS ur
    WHERE ur.user_id = p_admin_user_id AND ur.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT pi.* INTO v_imprint
  FROM public.publishing_imprints AS pi
  WHERE pi.id = p_imprint_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'IMPRINT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_imprint.verification_submitted_at IS NULL
     OR v_imprint.verification_pending_reference IS NULL
     OR v_imprint.verification_pending_method IS NULL THEN
    RAISE EXCEPTION 'IMPRINT_VERIFICATION_EVIDENCE_NOT_SUBMITTED' USING ERRCODE = '23514';
  END IF;

  v_reference := pg_catalog.btrim(COALESCE(p_verification_reference, ''));
  v_method := pg_catalog.btrim(COALESCE(p_verification_method, ''));
  IF v_reference IS DISTINCT FROM v_imprint.verification_pending_reference
     OR v_method IS DISTINCT FROM v_imprint.verification_pending_method THEN
    RAISE EXCEPTION 'IMPRINT_VERIFICATION_EVIDENCE_MISMATCH' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.publishing_imprint_verifications(
    imprint_id, status, verification_reference, verification_method, notes, reviewed_by, reviewed_at
  ) VALUES (
    p_imprint_id, v_status, v_reference, v_method,
    COALESCE(p_notes, v_imprint.verification_pending_notes), p_admin_user_id, v_now
  );

  UPDATE public.publishing_imprints AS pi
  SET verified = p_approved,
      verified_at = CASE WHEN p_approved THEN v_now ELSE NULL END,
      verified_by = CASE WHEN p_approved THEN p_admin_user_id ELSE NULL END,
      verification_reference = CASE WHEN p_approved THEN v_reference ELSE NULL END,
      verification_method = CASE WHEN p_approved THEN v_method ELSE NULL END,
      verification_pending_reference = NULL,
      verification_pending_method = NULL,
      verification_pending_notes = NULL,
      verification_submitted_by = NULL,
      verification_submitted_at = NULL
  WHERE pi.id = p_imprint_id;

  RETURN pg_catalog.jsonb_build_object(
    'imprint_id', p_imprint_id,
    'verified', p_approved,
    'status', v_status,
    'verification_reference', v_reference,
    'verification_method', v_method,
    'reviewed_at', v_now
  );
END;
$$;
REVOKE ALL ON FUNCTION public.review_publishing_imprint(uuid,uuid,boolean,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_publishing_imprint(uuid,uuid,boolean,text,text,text) TO service_role;

-- Final canonical definition: submit_platform_isbn_pool_batch
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

-- Final canonical definition: review_platform_isbn_pool_batch
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

-- Final canonical definition: submit_owned_isbn_claim
CREATE OR REPLACE FUNCTION public.submit_owned_isbn_claim(
  p_user_id uuid,
  p_book_id uuid,
  p_isbn text,
  p_agency_reference text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_isbn text := public.normalize_isbn13(p_isbn);
  v_profile public.book_publishing_profiles%ROWTYPE;
  v_imprint public.publishing_imprints%ROWTYPE;
  v_claim public.isbn_claim_requests%ROWTYPE;
  v_inventory public.isbn_inventory%ROWTYPE;
BEGIN
  IF NOT public.is_valid_isbn13(v_isbn) THEN
    RAISE EXCEPTION 'INVALID_ISBN13' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.length(pg_catalog.btrim(COALESCE(p_agency_reference, ''))) = 0 THEN
    RAISE EXCEPTION 'ISBN_AGENCY_REFERENCE_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.books AS b
    WHERE b.id = p_book_id AND (b.user_id = p_user_id OR b.creator_id = p_user_id)
  ) THEN
    RAISE EXCEPTION 'BOOK_NOT_OWNED' USING ERRCODE = '42501';
  END IF;

  SELECT bpp.* INTO v_profile
  FROM public.book_publishing_profiles AS bpp
  WHERE bpp.book_id = p_book_id AND bpp.owner_user_id = p_user_id;
  IF NOT FOUND OR v_profile.publisher_mode <> 'own_imprint' OR v_profile.imprint_id IS NULL THEN
    RAISE EXCEPTION 'OWN_IMPRINT_REQUIRED' USING ERRCODE = '23514';
  END IF;

  SELECT pi.* INTO v_imprint
  FROM public.publishing_imprints AS pi
  WHERE pi.id = v_profile.imprint_id
  FOR UPDATE;
  IF NOT FOUND OR v_imprint.scope <> 'user' OR v_imprint.owner_user_id <> p_user_id
     OR v_imprint.agency_record_attested IS NOT TRUE THEN
    RAISE EXCEPTION 'ISBN_AGENCY_MATCH_ATTESTATION_REQUIRED' USING ERRCODE = '23514';
  END IF;

  -- Do not downgrade a previously verified publisher/imprint. Otherwise the
  -- ownership claim itself supplies the evidence that awaits independent admin
  -- review. Verification is never granted in this path.
  IF v_imprint.verified IS NOT TRUE THEN
    PERFORM public.submit_publishing_imprint_verification(
      p_user_id,
      v_imprint.id,
      p_agency_reference,
      'manual_agency_record_review',
      'Evidence submitted with author-owned ISBN claim'
    );
  END IF;

  SELECT ii.* INTO v_inventory
  FROM public.isbn_inventory AS ii
  WHERE ii.isbn13 = v_isbn;
  IF FOUND THEN
    IF v_inventory.imprint_id = v_imprint.id
       AND v_inventory.source = 'publisher_owned'
       AND v_inventory.provenance_status = 'verified'
       AND v_inventory.claimed_by_user_id = p_user_id THEN
      RETURN pg_catalog.jsonb_build_object(
        'status', 'already_verified',
        'isbn13', v_isbn,
        'inventory_id', v_inventory.id
      );
    END IF;
    RAISE EXCEPTION 'ISBN_ALREADY_REGISTERED' USING ERRCODE = '23505';
  END IF;

  SELECT icr.* INTO v_claim
  FROM public.isbn_claim_requests AS icr
  WHERE icr.isbn13 = v_isbn AND icr.status IN ('pending','approved')
  ORDER BY icr.created_at DESC
  LIMIT 1;
  IF FOUND THEN
    IF v_claim.user_id <> p_user_id OR v_claim.imprint_id <> v_imprint.id THEN
      RAISE EXCEPTION 'ISBN_CLAIMED_BY_DIFFERENT_PUBLISHER' USING ERRCODE = '23505';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'claim_id', v_claim.id,
      'status', v_claim.status,
      'isbn13', v_claim.isbn13,
      'agency_reference', v_claim.agency_reference,
      'imprint_verification_status', CASE WHEN v_imprint.verified THEN 'verified' ELSE 'pending' END
    );
  END IF;

  INSERT INTO public.isbn_claim_requests(user_id, imprint_id, isbn13, agency_reference)
  VALUES(p_user_id, v_imprint.id, v_isbn, pg_catalog.btrim(p_agency_reference))
  RETURNING * INTO v_claim;

  RETURN pg_catalog.jsonb_build_object(
    'claim_id', v_claim.id,
    'status', v_claim.status,
    'isbn13', v_claim.isbn13,
    'agency_reference', v_claim.agency_reference,
    'imprint_verification_status', CASE WHEN v_imprint.verified THEN 'verified' ELSE 'pending' END
  );
END;
$$;
REVOKE ALL ON FUNCTION public.submit_owned_isbn_claim(uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_owned_isbn_claim(uuid,uuid,text,text) TO service_role;

-- Final canonical definition: review_owned_isbn_claim
CREATE OR REPLACE FUNCTION public.review_owned_isbn_claim(
  p_admin_user_id uuid,
  p_claim_id uuid,
  p_approved boolean,
  p_review_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claim public.isbn_claim_requests%ROWTYPE;
  v_imprint public.publishing_imprints%ROWTYPE;
  v_inventory public.isbn_inventory%ROWTYPE;
  v_now timestamptz := pg_catalog.now();
  v_status text := CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles AS ur
    WHERE ur.user_id = p_admin_user_id AND ur.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT icr.* INTO v_claim
  FROM public.isbn_claim_requests AS icr
  WHERE icr.id = p_claim_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ISBN_CLAIM_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_claim.status <> 'pending' THEN
    RETURN pg_catalog.jsonb_build_object(
      'claim_id', v_claim.id,
      'status', v_claim.status,
      'isbn13', v_claim.isbn13
    );
  END IF;

  SELECT pi.* INTO v_imprint
  FROM public.publishing_imprints AS pi
  WHERE pi.id = v_claim.imprint_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'IMPRINT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF p_approved THEN
    IF v_imprint.scope <> 'user' OR v_imprint.owner_user_id <> v_claim.user_id OR v_imprint.verified IS NOT TRUE THEN
      RAISE EXCEPTION 'VERIFIED_USER_IMPRINT_REQUIRED' USING ERRCODE = '23514';
    END IF;

    SELECT ii.* INTO v_inventory
    FROM public.isbn_inventory AS ii
    WHERE ii.isbn13 = v_claim.isbn13
    FOR UPDATE;

    IF FOUND THEN
      IF v_inventory.imprint_id <> v_claim.imprint_id OR v_inventory.source <> 'publisher_owned'
         OR v_inventory.claimed_by_user_id IS DISTINCT FROM v_claim.user_id THEN
        RAISE EXCEPTION 'ISBN_REGISTERED_TO_DIFFERENT_IMPRINT' USING ERRCODE = '23505';
      END IF;
      UPDATE public.isbn_inventory AS ii
      SET provenance_status = 'verified',
          provenance_reference = v_claim.agency_reference,
          provenance_verified_at = v_now,
          provenance_verified_by = p_admin_user_id
      WHERE ii.id = v_inventory.id;
    ELSE
      INSERT INTO public.isbn_inventory(
        imprint_id, isbn13, source, status, added_by,
        provenance_status, provenance_reference, provenance_verified_at,
        provenance_verified_by, claimed_by_user_id
      ) VALUES (
        v_claim.imprint_id, v_claim.isbn13, 'publisher_owned', 'available', v_claim.user_id,
        'verified', v_claim.agency_reference, v_now, p_admin_user_id, v_claim.user_id
      );
    END IF;
  END IF;

  UPDATE public.isbn_claim_requests AS icr
  SET status = v_status,
      reviewed_by = p_admin_user_id,
      reviewed_at = v_now,
      review_notes = p_review_notes
  WHERE icr.id = p_claim_id;

  RETURN pg_catalog.jsonb_build_object(
    'claim_id', p_claim_id,
    'status', v_status,
    'isbn13', v_claim.isbn13,
    'reviewed_at', v_now
  );
END;
$$;
REVOKE ALL ON FUNCTION public.review_owned_isbn_claim(uuid,uuid,boolean,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_owned_isbn_claim(uuid,uuid,boolean,text) TO service_role;

-- Final canonical definition: allocate_platform_isbn
CREATE OR REPLACE FUNCTION public.allocate_platform_isbn(
  p_user_id uuid,
  p_book_id uuid,
  p_product_form text,
  p_language text DEFAULT 'en',
  p_edition_label text DEFAULT 'First edition'
)
RETURNS TABLE(assignment_id uuid, isbn13 text, product_form text, language text, edition_label text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile public.book_publishing_profiles%ROWTYPE;
  v_imprint public.publishing_imprints%ROWTYPE;
  v_inventory public.isbn_inventory%ROWTYPE;
  v_existing public.book_isbn_assignments%ROWTYPE;
BEGIN
  IF p_product_form NOT IN ('paperback','hardcover','epub','pdf','audiobook') THEN
    RAISE EXCEPTION 'INVALID_PRODUCT_FORM' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.books AS b
    WHERE b.id = p_book_id AND (b.user_id = p_user_id OR b.creator_id = p_user_id)
  ) THEN
    RAISE EXCEPTION 'BOOK_NOT_OWNED' USING ERRCODE='42501';
  END IF;

  SELECT bpp.* INTO v_profile
  FROM public.book_publishing_profiles AS bpp
  WHERE bpp.book_id = p_book_id AND bpp.owner_user_id = p_user_id;
  IF NOT FOUND OR v_profile.publisher_mode <> 'platform_imprint' OR v_profile.imprint_id IS NULL THEN
    RAISE EXCEPTION 'PLATFORM_IMPRINT_REQUIRED' USING ERRCODE='23514';
  END IF;

  SELECT pi.* INTO v_imprint
  FROM public.publishing_imprints AS pi
  WHERE pi.id = v_profile.imprint_id;
  IF NOT FOUND OR v_imprint.scope <> 'platform' OR v_imprint.verified IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFIED_PLATFORM_IMPRINT_REQUIRED' USING ERRCODE='23514';
  END IF;

  SELECT bia.* INTO v_existing
  FROM public.book_isbn_assignments AS bia
  WHERE bia.book_id = p_book_id
    AND bia.product_form = p_product_form
    AND bia.language = p_language
    AND bia.edition_label = p_edition_label
  FOR UPDATE;

  IF v_existing.id IS NOT NULL AND v_existing.locked_at IS NOT NULL THEN
    SELECT ii.* INTO v_inventory FROM public.isbn_inventory AS ii WHERE ii.id = v_existing.isbn_id;
    IF v_inventory.provenance_status <> 'verified' THEN
      RAISE EXCEPTION 'ISBN_PROVENANCE_NOT_VERIFIED' USING ERRCODE='23514';
    END IF;
    RETURN QUERY SELECT v_existing.id, v_inventory.isbn13, p_product_form, p_language, p_edition_label;
    RETURN;
  END IF;

  SELECT ii.* INTO v_inventory
  FROM public.isbn_inventory AS ii
  WHERE ii.imprint_id = v_imprint.id
    AND ii.source = 'platform_pool'
    AND ii.status = 'available'
    AND ii.provenance_status = 'verified'
  ORDER BY ii.created_at, ii.id
  FOR UPDATE SKIP LOCKED
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ISBN_POOL_EMPTY' USING ERRCODE='P0002';
  END IF;

  IF v_existing.id IS NULL THEN
    INSERT INTO public.book_isbn_assignments(book_id,isbn_id,product_form,language,edition_label,assigned_by)
    VALUES(p_book_id,v_inventory.id,p_product_form,p_language,p_edition_label,p_user_id)
    RETURNING * INTO v_existing;
  ELSE
    UPDATE public.isbn_inventory AS ii SET status='available' WHERE ii.id=v_existing.isbn_id;
    UPDATE public.book_isbn_assignments AS bia
    SET isbn_id=v_inventory.id,
        assigned_by=p_user_id,
        assigned_at=pg_catalog.now()
    WHERE bia.id=v_existing.id
    RETURNING * INTO v_existing;
  END IF;

  UPDATE public.isbn_inventory AS ii SET status='assigned' WHERE ii.id=v_inventory.id;
  IF p_product_form='paperback' THEN
    UPDATE public.books AS b SET isbn=v_inventory.isbn13 WHERE b.id=p_book_id;
  END IF;
  RETURN QUERY SELECT v_existing.id,v_inventory.isbn13,p_product_form,p_language,p_edition_label;
END;
$$;
REVOKE ALL ON FUNCTION public.allocate_platform_isbn(uuid,uuid,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_platform_isbn(uuid,uuid,text,text,text) TO service_role;

-- Final canonical definition: assign_owned_isbn
CREATE OR REPLACE FUNCTION public.assign_owned_isbn(
  p_user_id uuid,
  p_book_id uuid,
  p_isbn text,
  p_product_form text,
  p_language text DEFAULT 'en',
  p_edition_label text DEFAULT 'First edition'
)
RETURNS TABLE(assignment_id uuid, isbn13 text, product_form text, language text, edition_label text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_isbn text := public.normalize_isbn13(p_isbn);
  v_profile public.book_publishing_profiles%ROWTYPE;
  v_imprint public.publishing_imprints%ROWTYPE;
  v_inventory public.isbn_inventory%ROWTYPE;
  v_existing public.book_isbn_assignments%ROWTYPE;
BEGIN
  IF p_product_form NOT IN ('paperback','hardcover','epub','pdf','audiobook') THEN
    RAISE EXCEPTION 'INVALID_PRODUCT_FORM' USING ERRCODE='22023';
  END IF;
  IF NOT public.is_valid_isbn13(v_isbn) THEN
    RAISE EXCEPTION 'INVALID_ISBN13' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.books AS b
    WHERE b.id = p_book_id AND (b.user_id = p_user_id OR b.creator_id = p_user_id)
  ) THEN
    RAISE EXCEPTION 'BOOK_NOT_OWNED' USING ERRCODE='42501';
  END IF;

  SELECT bpp.* INTO v_profile
  FROM public.book_publishing_profiles AS bpp
  WHERE bpp.book_id = p_book_id AND bpp.owner_user_id = p_user_id;
  IF NOT FOUND OR v_profile.publisher_mode <> 'own_imprint' OR v_profile.imprint_id IS NULL THEN
    RAISE EXCEPTION 'OWN_IMPRINT_REQUIRED' USING ERRCODE='23514';
  END IF;

  SELECT pi.* INTO v_imprint
  FROM public.publishing_imprints AS pi
  WHERE pi.id = v_profile.imprint_id;
  IF NOT FOUND OR v_imprint.scope <> 'user' OR v_imprint.owner_user_id <> p_user_id
     OR v_imprint.agency_record_attested IS NOT TRUE THEN
    RAISE EXCEPTION 'ISBN_AGENCY_MATCH_ATTESTATION_REQUIRED' USING ERRCODE='23514';
  END IF;
  IF v_imprint.verified IS NOT TRUE THEN
    RAISE EXCEPTION 'ISBN_IMPRINT_VERIFICATION_REQUIRED' USING ERRCODE='23514';
  END IF;

  SELECT ii.* INTO v_inventory
  FROM public.isbn_inventory AS ii
  WHERE ii.isbn13 = v_isbn
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ISBN_VERIFICATION_REQUIRED' USING ERRCODE='23514';
  END IF;
  IF v_inventory.imprint_id <> v_imprint.id OR v_inventory.source <> 'publisher_owned'
     OR v_inventory.claimed_by_user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'ISBN_REGISTERED_TO_DIFFERENT_IMPRINT' USING ERRCODE='23505';
  END IF;
  IF v_inventory.provenance_status <> 'verified' THEN
    RAISE EXCEPTION 'ISBN_VERIFICATION_REQUIRED' USING ERRCODE='23514';
  END IF;

  SELECT bia.* INTO v_existing
  FROM public.book_isbn_assignments AS bia
  WHERE bia.book_id = p_book_id
    AND bia.product_form = p_product_form
    AND bia.language = p_language
    AND bia.edition_label = p_edition_label
  FOR UPDATE;

  IF EXISTS (
    SELECT 1 FROM public.book_isbn_assignments AS a
    WHERE a.isbn_id = v_inventory.id
      AND (v_existing.id IS NULL OR a.id <> v_existing.id)
  ) THEN
    RAISE EXCEPTION 'ISBN_ALREADY_ASSIGNED' USING ERRCODE='23505';
  END IF;
  IF v_existing.id IS NOT NULL AND v_existing.locked_at IS NOT NULL AND v_existing.isbn_id <> v_inventory.id THEN
    RAISE EXCEPTION 'ISBN_ASSIGNMENT_LOCKED_BY_PUBLICATION' USING ERRCODE='23514';
  END IF;

  IF v_existing.id IS NULL THEN
    INSERT INTO public.book_isbn_assignments(book_id,isbn_id,product_form,language,edition_label,assigned_by)
    VALUES(p_book_id,v_inventory.id,p_product_form,p_language,p_edition_label,p_user_id)
    RETURNING * INTO v_existing;
  ELSIF v_existing.isbn_id <> v_inventory.id THEN
    UPDATE public.isbn_inventory AS ii SET status = 'available' WHERE ii.id = v_existing.isbn_id;
    UPDATE public.book_isbn_assignments AS bia
    SET isbn_id = v_inventory.id,
        assigned_by = p_user_id,
        assigned_at = pg_catalog.now()
    WHERE bia.id = v_existing.id
    RETURNING * INTO v_existing;
  END IF;

  UPDATE public.isbn_inventory AS ii SET status = 'assigned' WHERE ii.id = v_inventory.id;
  IF p_product_form = 'paperback' THEN
    UPDATE public.books AS b SET isbn = v_isbn WHERE b.id = p_book_id;
  END IF;

  RETURN QUERY SELECT v_existing.id, v_isbn, p_product_form, p_language, p_edition_label;
END;
$$;
REVOKE ALL ON FUNCTION public.assign_owned_isbn(uuid,uuid,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_owned_isbn(uuid,uuid,text,text,text,text) TO service_role;

