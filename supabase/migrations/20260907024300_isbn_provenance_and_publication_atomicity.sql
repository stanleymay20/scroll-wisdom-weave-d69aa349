-- ISBN provenance + publication finalization hardening.
--
-- Invariants introduced here:
--   * a mathematically valid ISBN is not treated as publisher-owned merely because
--     a user typed it into the UI;
--   * user-owned ISBNs must pass an auditable claim/review workflow before they
--     can enter assignable inventory;
--   * platform-pool ISBNs must carry an explicit verified provenance reference;
--   * ISBN allocation only consumes provenance-verified inventory;
--   * publication finalization locks exactly the ISBN assignments frozen into the
--     immutable publication snapshot and publishes/certifies/updates pointers in
--     one database transaction;
--   * a Publication cannot transition to published unless every frozen ISBN is
--     locked to that exact Publication and backed by verified provenance.

-- ---------------------------------------------------------------------------
-- Publisher/imprint verification provenance
-- ---------------------------------------------------------------------------
ALTER TABLE public.publishing_imprints
  ADD COLUMN IF NOT EXISTS verification_reference text,
  ADD COLUMN IF NOT EXISTS verification_method text,
  ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES auth.users(id);

CREATE TABLE IF NOT EXISTS public.publishing_imprint_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  imprint_id uuid NOT NULL REFERENCES public.publishing_imprints(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('verified','rejected')),
  verification_reference text NOT NULL CHECK (pg_catalog.length(pg_catalog.btrim(verification_reference)) BETWEEN 1 AND 500),
  verification_method text NOT NULL DEFAULT 'manual_agency_record_review'
    CHECK (pg_catalog.length(pg_catalog.btrim(verification_method)) BETWEEN 1 AND 120),
  notes text,
  reviewed_by uuid NOT NULL REFERENCES auth.users(id),
  reviewed_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);
CREATE INDEX IF NOT EXISTS publishing_imprint_verifications_imprint_idx
  ON public.publishing_imprint_verifications(imprint_id, reviewed_at DESC);

ALTER TABLE public.publishing_imprint_verifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.publishing_imprint_verifications FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.publishing_imprint_verifications TO service_role;
GRANT SELECT ON TABLE public.publishing_imprint_verifications TO authenticated;
DO $$ BEGIN
  CREATE POLICY publishing_imprint_verifications_owner_read
  ON public.publishing_imprint_verifications FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.publishing_imprints AS pi
      WHERE pi.id = publishing_imprint_verifications.imprint_id
        AND pi.owner_user_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

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
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles AS ur
    WHERE ur.user_id = p_admin_user_id AND ur.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;
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

  INSERT INTO public.publishing_imprint_verifications(
    imprint_id, status, verification_reference, verification_method, notes, reviewed_by, reviewed_at
  ) VALUES (
    p_imprint_id, v_status, pg_catalog.btrim(p_verification_reference),
    pg_catalog.btrim(p_verification_method), p_notes, p_admin_user_id, v_now
  );

  UPDATE public.publishing_imprints AS pi
  SET verified = p_approved,
      verified_at = CASE WHEN p_approved THEN v_now ELSE NULL END,
      verified_by = CASE WHEN p_approved THEN p_admin_user_id ELSE NULL END,
      verification_reference = pg_catalog.btrim(p_verification_reference),
      verification_method = pg_catalog.btrim(p_verification_method)
  WHERE pi.id = p_imprint_id;

  RETURN pg_catalog.jsonb_build_object(
    'imprint_id', p_imprint_id,
    'verified', p_approved,
    'status', v_status,
    'verification_reference', pg_catalog.btrim(p_verification_reference),
    'verification_method', pg_catalog.btrim(p_verification_method),
    'reviewed_at', v_now
  );
END;
$$;
REVOKE ALL ON FUNCTION public.review_publishing_imprint(uuid,uuid,boolean,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_publishing_imprint(uuid,uuid,boolean,text,text,text) TO service_role;

-- ---------------------------------------------------------------------------
-- ISBN inventory provenance and author claim workflow
-- ---------------------------------------------------------------------------
ALTER TABLE public.isbn_inventory
  ADD COLUMN IF NOT EXISTS provenance_status text NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS provenance_reference text,
  ADD COLUMN IF NOT EXISTS provenance_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS provenance_verified_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS claimed_by_user_id uuid REFERENCES auth.users(id);

DO $$ BEGIN
  ALTER TABLE public.isbn_inventory
    ADD CONSTRAINT isbn_inventory_provenance_status_check
    CHECK (provenance_status IN ('unverified','verified','rejected'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS isbn_inventory_verified_available_idx
  ON public.isbn_inventory(imprint_id, source, status, created_at, id)
  WHERE status = 'available' AND provenance_status = 'verified';

CREATE TABLE IF NOT EXISTS public.isbn_claim_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  imprint_id uuid NOT NULL REFERENCES public.publishing_imprints(id) ON DELETE RESTRICT,
  isbn13 text NOT NULL,
  agency_reference text NOT NULL CHECK (pg_catalog.length(pg_catalog.btrim(agency_reference)) BETWEEN 1 AND 500),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT isbn_claim_requests_valid_isbn CHECK (public.is_valid_isbn13(isbn13))
);
CREATE INDEX IF NOT EXISTS isbn_claim_requests_user_idx
  ON public.isbn_claim_requests(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS isbn_claim_requests_active_isbn_uq
  ON public.isbn_claim_requests(isbn13)
  WHERE status IN ('pending','approved');

ALTER TABLE public.isbn_claim_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.isbn_claim_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.isbn_claim_requests TO authenticated;
GRANT ALL ON TABLE public.isbn_claim_requests TO service_role;
DO $$ BEGIN
  CREATE POLICY isbn_claim_requests_owner_read
  ON public.isbn_claim_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_isbn_claim_requests_updated_at
  BEFORE UPDATE ON public.isbn_claim_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_publishing_identity_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

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
  WHERE pi.id = v_profile.imprint_id;
  IF NOT FOUND OR v_imprint.scope <> 'user' OR v_imprint.owner_user_id <> p_user_id
     OR v_imprint.agency_record_attested IS NOT TRUE THEN
    RAISE EXCEPTION 'ISBN_AGENCY_MATCH_ATTESTATION_REQUIRED' USING ERRCODE = '23514';
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
      'agency_reference', v_claim.agency_reference
    );
  END IF;

  INSERT INTO public.isbn_claim_requests(user_id, imprint_id, isbn13, agency_reference)
  VALUES(p_user_id, v_imprint.id, v_isbn, pg_catalog.btrim(p_agency_reference))
  RETURNING * INTO v_claim;

  RETURN pg_catalog.jsonb_build_object(
    'claim_id', v_claim.id,
    'status', v_claim.status,
    'isbn13', v_claim.isbn13,
    'agency_reference', v_claim.agency_reference
  );
END;
$$;
REVOKE ALL ON FUNCTION public.submit_owned_isbn_claim(uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_owned_isbn_claim(uuid,uuid,text,text) TO service_role;

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

-- ---------------------------------------------------------------------------
-- Assignment/allocation must consume provenance-verified inventory only.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Lock only the ISBN assignments frozen into a Publication snapshot.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Database invariant: published snapshots cannot reference unlocked/unverified ISBNs.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_require_verified_isbn_locks_before_publish()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_identifier jsonb;
  v_isbn text;
BEGIN
  IF NEW.status = 'published' AND OLD.status IS DISTINCT FROM NEW.status THEN
    FOR v_identifier IN
      SELECT value
      FROM pg_catalog.jsonb_array_elements(COALESCE(NEW.snapshot->'identifiers', '[]'::jsonb))
    LOOP
      IF v_identifier->>'scheme' <> 'ISBN-13' THEN
        CONTINUE;
      END IF;
      v_isbn := public.normalize_isbn13(COALESCE(v_identifier->>'value', ''));
      IF NOT EXISTS (
        SELECT 1
        FROM public.book_isbn_assignments AS bia
        JOIN public.isbn_inventory AS ii ON ii.id = bia.isbn_id
        WHERE bia.book_id = NEW.book_id
          AND bia.locked_publication_id = NEW.id
          AND bia.locked_at IS NOT NULL
          AND bia.product_form = v_identifier->>'product_form'
          AND bia.language = v_identifier->>'language'
          AND bia.edition_label = v_identifier->>'edition_label'
          AND ii.isbn13 = v_isbn
          AND ii.provenance_status = 'verified'
      ) THEN
        RAISE EXCEPTION 'PUBLICATION_ISBN_LOCK_INVARIANT_FAILED:%', v_isbn USING ERRCODE='23514';
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_require_verified_isbn_locks_before_publish() FROM PUBLIC, anon, authenticated;
DO $$ BEGIN
  CREATE TRIGGER trg_publications_require_verified_isbn_locks
  BEFORE UPDATE ON public.publications
  FOR EACH ROW EXECUTE FUNCTION public.tg_require_verified_isbn_locks_before_publish();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Atomic finalization: ISBN locks + SLP materialization + certificate + publish
-- transition + current-publication pointers succeed or roll back together.
-- ---------------------------------------------------------------------------
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
