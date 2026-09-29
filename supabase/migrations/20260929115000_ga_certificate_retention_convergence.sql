-- GA convergence: certificate verification records must survive account/book deletion.

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

DROP TRIGGER IF EXISTS publishing_certificates_capture_book_identity ON public.publishing_certificates;
CREATE TRIGGER publishing_certificates_capture_book_identity
  BEFORE INSERT OR UPDATE OF book_id ON public.publishing_certificates
  FOR EACH ROW EXECUTE FUNCTION public.capture_certificate_book_identity();

DROP TRIGGER IF EXISTS competency_certificates_capture_book_identity ON public.competency_certificates;
CREATE TRIGGER competency_certificates_capture_book_identity
  BEFORE INSERT OR UPDATE OF book_id ON public.competency_certificates
  FOR EACH ROW EXECUTE FUNCTION public.capture_certificate_book_identity();

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

ALTER TABLE public.competency_certificates
  ALTER COLUMN book_id DROP NOT NULL,
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.competency_certificates
  DROP CONSTRAINT IF EXISTS competency_certificates_book_id_fkey;

ALTER TABLE public.competency_certificates
  ADD CONSTRAINT competency_certificates_book_id_fkey
    FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE SET NULL;

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
    COALESCE(b.title, NULLIF(pc.metadata ->> 'bookTitle', ''), 'Record unavailable') AS book_title,
    pc.issued_at,
    pc.verification_hash
  FROM public.publishing_certificates AS pc
  LEFT JOIN public.books AS b ON b.id = pc.book_id
  WHERE pc.certificate_number = $1
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.verify_certificate(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_certificate(text) TO anon, authenticated;

DO $assert$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='publishing_certificates'
      AND column_name in ('book_id','user_id') AND is_nullable <> 'YES'
  ) THEN
    RAISE EXCEPTION 'GA retention convergence failed: publishing certificate references must be nullable';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='competency_certificates'
      AND column_name in ('book_id','user_id') AND is_nullable <> 'YES'
  ) THEN
    RAISE EXCEPTION 'GA retention convergence failed: competency certificate references must be nullable';
  END IF;
  IF to_regprocedure('public.verify_certificate(text)') IS NULL THEN
    RAISE EXCEPTION 'GA retention convergence failed: public verification RPC missing';
  END IF;
END
$assert$;
