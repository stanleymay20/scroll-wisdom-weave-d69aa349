BEGIN;

DO $policy$
DECLARE
  v_business uuid;
  v_fiction uuid;
BEGIN
  INSERT INTO public.books (title, category)
  VALUES ('Business evidence policy fixture', 'business')
  RETURNING id INTO v_business;

  INSERT INTO public.books (title, category)
  VALUES ('Fiction evidence policy fixture', 'fiction')
  RETURNING id INTO v_fiction;

  IF public.book_requires_publication_evidence(v_business) IS NOT TRUE THEN
    RAISE EXCEPTION 'business must require publication evidence';
  END IF;

  IF public.book_requires_publication_evidence(v_fiction) IS NOT FALSE THEN
    RAISE EXCEPTION 'fiction must not be forced into factual evidence policy';
  END IF;
END
$policy$;

ROLLBACK;
