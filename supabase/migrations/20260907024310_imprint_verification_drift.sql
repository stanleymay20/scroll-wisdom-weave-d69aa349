-- Publisher/imprint verification is evidence-bound. If any registry-facing
-- identity field changes after review, clear the verification state and require
-- a fresh administrative review before ISBN assignment/allocation can continue.
CREATE OR REPLACE FUNCTION public.tg_invalidate_imprint_verification_on_identity_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.publisher_name IS DISTINCT FROM OLD.publisher_name
     OR NEW.imprint_name IS DISTINCT FROM OLD.imprint_name
     OR NEW.country_code IS DISTINCT FROM OLD.country_code
     OR NEW.isbn_agency_name IS DISTINCT FROM OLD.isbn_agency_name
     OR NEW.registrant_name IS DISTINCT FROM OLD.registrant_name
     OR NEW.agency_record_attested IS DISTINCT FROM OLD.agency_record_attested
  THEN
    NEW.verified := false;
    NEW.verified_at := NULL;
    NEW.verified_by := NULL;
    NEW.verification_reference := NULL;
    NEW.verification_method := NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_invalidate_imprint_verification_on_identity_change() FROM PUBLIC, anon, authenticated;

DO $$ BEGIN
  CREATE TRIGGER trg_publishing_imprints_invalidate_verification
  BEFORE UPDATE ON public.publishing_imprints
  FOR EACH ROW EXECUTE FUNCTION public.tg_invalidate_imprint_verification_on_identity_change();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
