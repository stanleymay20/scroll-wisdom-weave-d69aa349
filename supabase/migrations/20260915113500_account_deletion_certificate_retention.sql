-- Preserve certificate audit records when a user exercises account deletion.
--
-- The product contract promises that certificates are revoked, not erased, so
-- employers and institutions can continue to verify that a previously issued
-- credential is no longer valid. Historically, publishing certificates used
-- ON DELETE CASCADE for both auth user and book ownership, while competency
-- certificates cascaded with their book. Deleting the account's books therefore
-- erased the very records the UI and Edge API promised to retain.
--
-- Keep immutable book identity inside certificate metadata before relaxing the
-- ownership foreign keys. Existing metadata wins when it already contains a
-- non-null issuance-time value.

UPDATE public.publishing_certificates AS pc
SET metadata = pg_catalog.jsonb_build_object(
      'bookTitle', b.title,
      'bookCategory', b.category::text
    ) || pg_catalog.jsonb_strip_nulls(COALESCE(pc.metadata, '{}'::jsonb))
FROM public.books AS b
WHERE pc.book_id = b.id;

UPDATE public.competency_certificates AS cc
SET metadata = pg_catalog.jsonb_build_object(
      'bookTitle', b.title,
      'bookCategory', b.category::text
    ) || pg_catalog.jsonb_strip_nulls(COALESCE(cc.metadata, '{}'::jsonb))
FROM public.books AS b
WHERE cc.book_id = b.id;

-- Capture the book identity for every newly issued certificate so verification
-- remains meaningful after the source book has been removed.
CREATE OR REPLACE FUNCTION public.capture_certificate_book_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _book_title text;
  _book_category text;
BEGIN
  IF NEW.book_id IS NOT NULL THEN
    SELECT b.title, b.category::text
      INTO _book_title, _book_category
    FROM public.books AS b
    WHERE b.id = NEW.book_id;

    IF FOUND THEN
      NEW.metadata := pg_catalog.jsonb_build_object(
          'bookTitle', _book_title,
          'bookCategory', _book_category
        ) || pg_catalog.jsonb_strip_nulls(COALESCE(NEW.metadata, '{}'::jsonb));
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_certificate_book_identity() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER publishing_certificates_capture_book_identity
  BEFORE INSERT OR UPDATE OF book_id ON public.publishing_certificates
  FOR EACH ROW EXECUTE FUNCTION public.capture_certificate_book_identity();

CREATE TRIGGER competency_certificates_capture_book_identity
  BEFORE INSERT OR UPDATE OF book_id ON public.competency_certificates
  FOR EACH ROW EXECUTE FUNCTION public.capture_certificate_book_identity();

-- Publishing certificates must survive deletion of both the source book and
-- the account. Nulling those now-defunct references keeps the audit record
-- without retaining a live account relationship.
ALTER TABLE public.publishing_certificates
  ALTER COLUMN book_id DROP NOT NULL,
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.publishing_certificates
  DROP CONSTRAINT IF EXISTS publishing_certificates_book_id_fkey,
  DROP CONSTRAINT IF EXISTS publishing_certificates_user_id_fkey;

ALTER TABLE public.publishing_certificates
  ADD CONSTRAINT publishing_certificates_book_id_fkey
    FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE SET NULL,
  ADD CONSTRAINT publishing_certificates_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Competency certificates historically did not foreign-key user_id, but their
-- book reference cascaded. Make both references nullable so account deletion can
-- revoke the credential and detach it from personal/source records.
ALTER TABLE public.competency_certificates
  ALTER COLUMN book_id DROP NOT NULL,
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.competency_certificates
  DROP CONSTRAINT IF EXISTS competency_certificates_book_id_fkey;

ALTER TABLE public.competency_certificates
  ADD CONSTRAINT competency_certificates_book_id_fkey
    FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE SET NULL;

-- The limited public RPC must not depend on the source book still existing.
CREATE OR REPLACE FUNCTION public.verify_certificate(cert_number text)
RETURNS TABLE (
  is_valid boolean,
  certificate_type text,
  book_title text,
  issued_at timestamptz,
  verification_hash text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    pc.revoked_at IS NULL AS is_valid,
    pc.certificate_type,
    COALESCE(
      b.title,
      NULLIF(pc.metadata ->> 'bookTitle', ''),
      'Record unavailable'
    ) AS book_title,
    pc.issued_at,
    pc.verification_hash
  FROM public.publishing_certificates AS pc
  LEFT JOIN public.books AS b ON b.id = pc.book_id
  WHERE pc.certificate_number = $1
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.verify_certificate(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_certificate(text) TO anon, authenticated;
