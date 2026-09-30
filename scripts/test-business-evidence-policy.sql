BEGIN;

DO $policy$
DECLARE
  v_business uuid;
  v_bestseller uuid;
  v_illustrated uuid;
  v_fiction uuid;
BEGIN
  INSERT INTO public.books (title, category)
  VALUES ('Business evidence policy fixture', 'business')
  RETURNING id INTO v_business;

  INSERT INTO public.books (title, category, book_type)
  VALUES ('Bestseller evidence policy fixture', 'fiction', 'bestseller')
  RETURNING id INTO v_bestseller;

  INSERT INTO public.books (title, category, book_type)
  VALUES ('Illustrated evidence policy fixture', 'fiction', 'illustrated')
  RETURNING id INTO v_illustrated;

  INSERT INTO public.books (title, category, book_type)
  VALUES ('Fiction evidence policy fixture', 'fiction', 'fiction')
  RETURNING id INTO v_fiction;

  IF public.book_requires_publication_evidence(v_business) IS NOT TRUE THEN
    RAISE EXCEPTION 'business must require publication evidence';
  END IF;

  IF public.book_requires_publication_evidence(v_bestseller) IS NOT TRUE THEN
    RAISE EXCEPTION 'bestseller must require publication evidence';
  END IF;

  IF public.book_requires_publication_evidence(v_illustrated) IS NOT TRUE THEN
    RAISE EXCEPTION 'illustrated must require publication evidence';
  END IF;

  IF public.book_requires_publication_evidence(v_fiction) IS NOT FALSE THEN
    RAISE EXCEPTION 'fiction must not be forced into factual evidence policy';
  END IF;
END
$policy$;

ROLLBACK;
