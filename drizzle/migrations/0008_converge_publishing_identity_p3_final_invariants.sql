-- Lovable Test convergence Phase 3: final ISBN governance invariants.
--
-- This file is deliberately a narrow delta over the already-applied Test
-- migrations 0006/0007. It does not recreate tables, replay historical
-- migrations, or mutate publication/user data.
--
-- Reassert the FINAL trigger definitions from the canonical Supabase lineage.

CREATE OR REPLACE FUNCTION public.tg_record_platform_isbn_batch_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.provenance_batch_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.platform_isbn_pool_verification_batch_items(
      batch_id, isbn_inventory_id, isbn13
    )
    VALUES(NEW.provenance_batch_id, NEW.id, NEW.isbn13)
    ON CONFLICT DO NOTHING;
  ELSIF OLD.provenance_batch_id IS DISTINCT FROM NEW.provenance_batch_id THEN
    INSERT INTO public.platform_isbn_pool_verification_batch_items(
      batch_id, isbn_inventory_id, isbn13
    )
    VALUES(NEW.provenance_batch_id, NEW.id, NEW.isbn13)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_record_platform_isbn_batch_membership()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_record_platform_isbn_batch_membership
  ON public.isbn_inventory;
CREATE TRIGGER trg_record_platform_isbn_batch_membership
AFTER INSERT OR UPDATE OF provenance_batch_id
ON public.isbn_inventory
FOR EACH ROW
EXECUTE FUNCTION public.tg_record_platform_isbn_batch_membership();

CREATE OR REPLACE FUNCTION public.tg_platform_isbn_batch_item_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'ISBN_POOL_BATCH_ITEM_IMMUTABLE'
    USING ERRCODE = '23514';
END;
$$;

REVOKE ALL ON FUNCTION public.tg_platform_isbn_batch_item_immutable()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_platform_isbn_batch_item_immutable
  ON public.platform_isbn_pool_verification_batch_items;
CREATE TRIGGER trg_platform_isbn_batch_item_immutable
BEFORE UPDATE OR DELETE
ON public.platform_isbn_pool_verification_batch_items
FOR EACH ROW
EXECUTE FUNCTION public.tg_platform_isbn_batch_item_immutable();

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
      CHECK (
        submitted_by IS NULL
        OR reviewed_by IS DISTINCT FROM submitted_by
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.isbn_claim_requests'::regclass
      AND conname = 'isbn_claim_requests_independent_reviewer_chk'
  ) THEN
    ALTER TABLE public.isbn_claim_requests
      ADD CONSTRAINT isbn_claim_requests_independent_reviewer_chk
      CHECK (
        reviewed_by IS NULL
        OR reviewed_by IS DISTINCT FROM user_id
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.platform_isbn_pool_verification_batches'::regclass
      AND conname = 'platform_isbn_pool_batches_independent_reviewer_chk'
  ) THEN
    ALTER TABLE public.platform_isbn_pool_verification_batches
      ADD CONSTRAINT platform_isbn_pool_batches_independent_reviewer_chk
      CHECK (
        reviewed_by IS NULL
        OR reviewed_by IS DISTINCT FROM submitted_by
      );
  END IF;
END
$$;

DROP TRIGGER IF EXISTS trg_require_independent_imprint_verification_review
  ON public.publishing_imprint_verifications;
CREATE TRIGGER trg_require_independent_imprint_verification_review
BEFORE INSERT
ON public.publishing_imprint_verifications
FOR EACH ROW
EXECUTE FUNCTION public.tg_require_independent_imprint_verification_review();

-- Preserve the intended trust boundary even if default function/table grants
-- drift in the managed database.
REVOKE ALL ON TABLE public.platform_isbn_pool_verification_batch_items
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.platform_isbn_pool_verification_batch_items
  TO service_role;

REVOKE ALL ON TABLE public.platform_isbn_pool_verification_batches
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.platform_isbn_pool_verification_batches
  TO service_role;

REVOKE ALL ON FUNCTION public.tg_record_platform_isbn_batch_membership()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_platform_isbn_batch_item_immutable()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_require_independent_imprint_verification_review()
  FROM PUBLIC, anon, authenticated;
