-- Author-owned ISBN claims already carry an ISBN-agency ownership/allocation
-- reference. For an unverified user imprint, use that same submitted evidence
-- to create the pending imprint-verification state. This is evidence submission
-- only; admin approval remains a separate review action.
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
