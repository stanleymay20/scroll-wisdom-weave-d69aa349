-- Enforce two-person review for ISBN and publisher provenance.
--
-- Evidence submission and approval were already separate actions, but the same
-- administrator could still perform both. These database invariants make
-- reviewer independence non-bypassable from Edge Functions or future UIs.

BEGIN;

-- Preserve who submitted imprint evidence on the immutable review record.
ALTER TABLE public.publishing_imprint_verifications
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES auth.users(id);

CREATE OR REPLACE FUNCTION public.tg_require_independent_imprint_verification_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_submitted_by uuid;
BEGIN
  SELECT pi.verification_submitted_by
  INTO v_submitted_by
  FROM public.publishing_imprints AS pi
  WHERE pi.id = NEW.imprint_id;

  IF NOT FOUND OR v_submitted_by IS NULL THEN
    RAISE EXCEPTION 'IMPRINT_VERIFICATION_EVIDENCE_NOT_SUBMITTED'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.reviewed_by IS NULL THEN
    RAISE EXCEPTION 'IMPRINT_REVIEWER_REQUIRED'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.reviewed_by = v_submitted_by THEN
    RAISE EXCEPTION 'IMPRINT_REVIEWER_SEPARATION_REQUIRED'
      USING ERRCODE = '23514';
  END IF;

  NEW.submitted_by := v_submitted_by;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_require_independent_imprint_verification_review()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_require_independent_imprint_verification_review
  ON public.publishing_imprint_verifications;
CREATE TRIGGER trg_require_independent_imprint_verification_review
BEFORE INSERT ON public.publishing_imprint_verifications
FOR EACH ROW
EXECUTE FUNCTION public.tg_require_independent_imprint_verification_review();

-- The constraints below are a second line of defense. They also make the
-- reviewer-separation contract explicit in the schema and protect direct
-- service-role mutations.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.publishing_imprint_verifications'::regclass
      AND conname = 'publishing_imprint_verifications_independent_reviewer_chk'
  ) THEN
    ALTER TABLE public.publishing_imprint_verifications
      ADD CONSTRAINT publishing_imprint_verifications_independent_reviewer_chk
      CHECK (submitted_by IS NULL OR reviewed_by IS DISTINCT FROM submitted_by);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.isbn_claim_requests'::regclass
      AND conname = 'isbn_claim_requests_independent_reviewer_chk'
  ) THEN
    ALTER TABLE public.isbn_claim_requests
      ADD CONSTRAINT isbn_claim_requests_independent_reviewer_chk
      CHECK (reviewed_by IS NULL OR reviewed_by IS DISTINCT FROM user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.platform_isbn_pool_verification_batches'::regclass
      AND conname = 'platform_isbn_pool_batches_independent_reviewer_chk'
  ) THEN
    ALTER TABLE public.platform_isbn_pool_verification_batches
      ADD CONSTRAINT platform_isbn_pool_batches_independent_reviewer_chk
      CHECK (reviewed_by IS NULL OR reviewed_by IS DISTINCT FROM submitted_by);
  END IF;
END;
$$;

COMMIT;
