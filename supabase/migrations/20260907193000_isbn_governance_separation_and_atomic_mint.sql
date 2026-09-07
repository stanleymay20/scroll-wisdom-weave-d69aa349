-- Separate ISBN evidence submission from verification approval and make
-- verified Publication minting atomic with ISBN locking/finalization.
--
-- This migration is additive/backward-compatible with the existing ISBN
-- provenance model introduced by 20260907024300.

-- ---------------------------------------------------------------------------
-- Imprint evidence submission is a distinct state from verified identity.
-- ---------------------------------------------------------------------------
ALTER TABLE public.publishing_imprints
  ADD COLUMN IF NOT EXISTS verification_pending_reference text,
  ADD COLUMN IF NOT EXISTS verification_pending_method text,
  ADD COLUMN IF NOT EXISTS verification_pending_notes text,
  ADD COLUMN IF NOT EXISTS verification_submitted_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS verification_submitted_at timestamptz;

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

-- Preserve the existing signature used by the Edge Function, but a review is
-- now legal only after a separate evidence-submission action. The review must
-- match the submitted evidence exactly; callers cannot smuggle new evidence
-- into the approval step.
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

-- ---------------------------------------------------------------------------
-- Platform ISBN pool evidence also uses submit -> review -> verified inventory.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_isbn_pool_verification_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  imprint_id uuid NOT NULL REFERENCES public.publishing_imprints(id) ON DELETE RESTRICT,
  provenance_reference text NOT NULL CHECK (pg_catalog.length(pg_catalog.btrim(provenance_reference)) BETWEEN 1 AND 500),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','rejected')),
  submitted_by uuid NOT NULL REFERENCES auth.users(id),
  submitted_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  review_notes text,
  isbn_count integer NOT NULL CHECK (isbn_count > 0)
);

ALTER TABLE public.platform_isbn_pool_verification_batches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.platform_isbn_pool_verification_batches FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.platform_isbn_pool_verification_batches TO service_role;

ALTER TABLE public.isbn_inventory
  ADD COLUMN IF NOT EXISTS provenance_batch_id uuid REFERENCES public.platform_isbn_pool_verification_batches(id) ON DELETE RESTRICT;

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
  IF NOT FOUND OR v_imprint.scope <> 'platform' OR v_imprint.verified IS NOT TRUE OR v_imprint.verification_reference IS NULL THEN
    RAISE EXCEPTION 'VERIFIED_PLATFORM_IMPRINT_REQUIRED' USING ERRCODE = '23514';
  END IF;

  FOREACH v_raw IN ARRAY p_isbns LOOP
    v_isbn := public.normalize_isbn13(v_raw);
    IF NOT public.is_valid_isbn13(v_isbn) THEN
      RAISE EXCEPTION 'INVALID_ISBN13:%', v_raw USING ERRCODE = '22023';
    END IF;
    IF NOT (v_isbn = ANY(v_numbers)) THEN
      v_numbers := pg_catalog.array_append(v_numbers, v_isbn);
    END IF;
  END LOOP;

  INSERT INTO public.platform_isbn_pool_verification_batches(
    imprint_id, provenance_reference, submitted_by, isbn_count
  ) VALUES (
    p_imprint_id, pg_catalog.btrim(p_provenance_reference), p_admin_user_id, pg_catalog.array_length(v_numbers, 1)
  ) RETURNING id INTO v_batch_id;

  FOREACH v_isbn IN ARRAY v_numbers LOOP
    SELECT ii.* INTO v_existing
    FROM public.isbn_inventory AS ii
    WHERE ii.isbn13 = v_isbn
    FOR UPDATE;

    IF FOUND THEN
      IF v_existing.imprint_id <> p_imprint_id OR v_existing.source <> 'platform_pool' OR v_existing.status <> 'available' THEN
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
  v_now timestamptz := pg_catalog.now();
  v_status text := CASE WHEN p_approved THEN 'verified' ELSE 'rejected' END;
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
    RETURN pg_catalog.jsonb_build_object('batch_id', v_batch.id, 'status', v_batch.status, 'idempotent', true);
  END IF;

  UPDATE public.isbn_inventory AS ii
  SET provenance_status = CASE WHEN p_approved THEN 'verified' ELSE 'rejected' END,
      provenance_verified_at = CASE WHEN p_approved THEN v_now ELSE NULL END,
      provenance_verified_by = CASE WHEN p_approved THEN p_admin_user_id ELSE NULL END
  WHERE ii.provenance_batch_id = p_batch_id
    AND ii.imprint_id = v_batch.imprint_id
    AND ii.source = 'platform_pool';

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
-- Atomic mint: finalize inside the same transaction as the approved
-- Publication INSERT. publish-work's subsequent finalizer call remains a safe
-- idempotent readback, so no API contract is weakened.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_finalize_verified_publication_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'approved'
     AND NEW.integrity_level::text = 'verified_published'
     AND NEW.book_id IS NOT NULL
     AND NEW.published_by IS NOT NULL
     AND NEW.content_hash IS NOT NULL
     AND NEW.snapshot IS NOT NULL
     AND NEW.snapshot ? 'publication_trust' THEN
    PERFORM public.finalize_publication_release(NEW.id, NEW.published_by);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_finalize_verified_publication_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_finalize_verified_publication_insert ON public.publications;
CREATE TRIGGER trg_finalize_verified_publication_insert
AFTER INSERT ON public.publications
FOR EACH ROW EXECUTE FUNCTION public.tg_finalize_verified_publication_insert();
