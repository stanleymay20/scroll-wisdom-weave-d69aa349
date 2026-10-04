BEGIN;

DO $policy$
DECLARE
  v_business uuid;
  v_health uuid;
  v_psychology uuid;
  v_plain_text uuid;
  v_material_text uuid;
  v_material_workbook uuid;
  v_story_fiction uuid;
BEGIN
  INSERT INTO public.books (title, category, book_type)
  VALUES ('Business evidence policy fixture', 'business', 'text')
  RETURNING id INTO v_business;

  INSERT INTO public.books (title, category, book_type)
  VALUES ('Health evidence policy fixture', 'health', 'text')
  RETURNING id INTO v_health;

  INSERT INTO public.books (title, category, book_type)
  VALUES ('Psychology evidence policy fixture', 'psychology', 'text')
  RETURNING id INTO v_psychology;

  INSERT INTO public.books (title, category, book_type)
  VALUES ('Plain creative text fixture', 'fiction', 'text')
  RETURNING id INTO v_plain_text;

  INSERT INTO public.books (title, category, book_type)
  VALUES ('Material factual text fixture', 'fiction', 'text')
  RETURNING id INTO v_material_text;

  INSERT INTO public.chapters(book_id, chapter_number, title, content, is_generated)
  VALUES (
    v_material_text,
    1,
    'Material Claim',
    'Salesforce acquired Celonis for $11 billion in 2025.',
    true
  );

  INSERT INTO public.books (title, category, book_type)
  VALUES ('Material factual workbook fixture', 'fiction', 'workbook')
  RETURNING id INTO v_material_workbook;

  INSERT INTO public.chapters(book_id, chapter_number, title, content, is_generated)
  VALUES (
    v_material_workbook,
    1,
    'Regulatory Exercise',
    'The law requires a minimum share capital of €25,000 in 2026.',
    true
  );

  INSERT INTO public.books (title, category, book_type)
  VALUES ('Fiction material-claim exemption fixture', 'fiction', 'fiction')
  RETURNING id INTO v_story_fiction;

  INSERT INTO public.chapters(book_id, chapter_number, title, content, is_generated)
  VALUES (
    v_story_fiction,
    1,
    'Story',
    'In 2025 she bought the imaginary company for $11 billion and walked home.',
    true
  );

  IF public.book_requires_publication_evidence(v_business) IS NOT TRUE THEN
    RAISE EXCEPTION 'business category must require publication evidence';
  END IF;

  IF public.book_requires_publication_evidence(v_health) IS NOT TRUE THEN
    RAISE EXCEPTION 'health category must require publication evidence';
  END IF;

  IF public.book_requires_publication_evidence(v_psychology) IS NOT TRUE THEN
    RAISE EXCEPTION 'psychology category must require publication evidence';
  END IF;

  IF public.book_requires_publication_evidence(v_plain_text) IS NOT FALSE THEN
    RAISE EXCEPTION 'plain creative text without material factual claims must not be forced into evidence review';
  END IF;

  IF public.book_requires_publication_evidence(v_material_text) IS NOT TRUE THEN
    RAISE EXCEPTION 'Standard Text with a material factual claim must require publication evidence';
  END IF;

  IF public.book_requires_publication_evidence(v_material_workbook) IS NOT TRUE THEN
    RAISE EXCEPTION 'Workbook with a material factual claim must require publication evidence';
  END IF;

  IF public.book_requires_publication_evidence(v_story_fiction) IS NOT FALSE THEN
    RAISE EXCEPTION 'fiction must not be forced into factual evidence policy solely for story dates or money';
  END IF;
END
$policy$;

ROLLBACK;
