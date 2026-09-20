\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  _book_id uuid;
  _publishing_id uuid;
  _competency_id uuid;
  _publishing public.publishing_certificates%ROWTYPE;
  _competency public.competency_certificates%ROWTYPE;
  _verified record;
BEGIN
  INSERT INTO public.books (
    title,
    description,
    category,
    author_ai_agent,
    is_published,
    is_featured
  ) VALUES (
    'GA Certificate Retention Book',
    'Disposable schema-contract fixture.',
    'technology',
    'ScrollLibrary GA',
    false,
    false
  )
  RETURNING id INTO _book_id;

  INSERT INTO public.publishing_certificates (
    book_id,
    user_id,
    certificate_number,
    metadata
  ) VALUES (
    _book_id,
    NULL,
    'GA-RETENTION-PUBLISHING',
    '{"integrityScore":1,"recipientName":"GA Retention"}'::jsonb
  )
  RETURNING id INTO _publishing_id;

  INSERT INTO public.competency_certificates (
    book_id,
    user_id,
    certificate_number,
    metadata
  ) VALUES (
    _book_id,
    NULL,
    'GA-RETENTION-COMPETENCY',
    '{"recipientName":"GA Retention"}'::jsonb
  )
  RETURNING id INTO _competency_id;

  SELECT * INTO _publishing
  FROM public.publishing_certificates
  WHERE id = _publishing_id;

  SELECT * INTO _competency
  FROM public.competency_certificates
  WHERE id = _competency_id;

  IF _publishing.metadata ->> 'bookTitle' <> 'GA Certificate Retention Book' THEN
    RAISE EXCEPTION 'publishing certificate did not snapshot book title';
  END IF;

  IF _competency.metadata ->> 'bookTitle' <> 'GA Certificate Retention Book' THEN
    RAISE EXCEPTION 'competency certificate did not snapshot book title';
  END IF;

  DELETE FROM public.books WHERE id = _book_id;

  SELECT * INTO _publishing
  FROM public.publishing_certificates
  WHERE id = _publishing_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'publishing certificate was cascade-deleted with its book';
  END IF;

  IF _publishing.book_id IS NOT NULL THEN
    RAISE EXCEPTION 'publishing certificate book_id was not detached';
  END IF;

  SELECT * INTO _competency
  FROM public.competency_certificates
  WHERE id = _competency_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'competency certificate was cascade-deleted with its book';
  END IF;

  IF _competency.book_id IS NOT NULL THEN
    RAISE EXCEPTION 'competency certificate book_id was not detached';
  END IF;

  SELECT * INTO _verified
  FROM public.verify_certificate('GA-RETENTION-PUBLISHING');

  IF _verified.book_title <> 'GA Certificate Retention Book' THEN
    RAISE EXCEPTION 'public verification lost the deleted book title: %', _verified.book_title;
  END IF;

  IF _verified.is_valid IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'non-revoked retained certificate unexpectedly became invalid';
  END IF;
END
$$;

ROLLBACK;
