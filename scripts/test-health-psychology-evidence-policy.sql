BEGIN;

DO $policy$
DECLARE
  v_health uuid;
  v_psychology uuid;
  v_plain_fiction uuid;
BEGIN
  INSERT INTO public.books (title, category, book_type)
  VALUES ('Health evidence policy fixture', 'health', 'text')
  RETURNING id INTO v_health;

  INSERT INTO public.books (title, category, book_type)
  VALUES ('Psychology evidence policy fixture', 'psychology', 'text')
  RETURNING id INTO v_psychology;

  INSERT INTO public.books (title, category, book_type)
  VALUES ('Creative control fixture', 'fiction', 'text')
  RETURNING id INTO v_plain_fiction;

  IF public.book_requires_publication_evidence(v_health) IS NOT TRUE THEN
    RAISE EXCEPTION 'health category must require publication evidence';
  END IF;

  IF public.book_requires_publication_evidence(v_psychology) IS NOT TRUE THEN
    RAISE EXCEPTION 'psychology category must require publication evidence';
  END IF;

  IF public.book_requires_publication_evidence(v_plain_fiction) IS NOT FALSE THEN
    RAISE EXCEPTION 'plain creative fiction text must not require evidence solely by text book type';
  END IF;
END
$policy$;

ROLLBACK;
