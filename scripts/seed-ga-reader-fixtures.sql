-- GA-only fixture seeding for the disposable local Supabase database.
-- This deliberately uses the local database owner rather than broadening
-- service_role privileges on hardened application tables.
DO $$
DECLARE
  user_one_id uuid;
  user_two_id uuid;
  lifecycle_book_id uuid;
  first_chapter_id uuid;
BEGIN
  SELECT id INTO STRICT user_one_id
  FROM auth.users
  WHERE email = 'ga-e2e-one@example.test';

  SELECT id INTO STRICT user_two_id
  FROM auth.users
  WHERE email = 'ga-e2e-two@example.test';

  SELECT id INTO STRICT lifecycle_book_id
  FROM public.books
  WHERE title = 'GA E2E Lifecycle Book'
    AND user_id = user_one_id;

  SELECT id INTO STRICT first_chapter_id
  FROM public.chapters
  WHERE book_id = lifecycle_book_id
    AND chapter_number = 1;

  INSERT INTO public.user_library (
    user_id,
    book_id,
    last_read_chapter,
    progress_percent
  ) VALUES (
    user_one_id,
    lifecycle_book_id,
    1,
    25
  );

  INSERT INTO public.highlights (
    user_id,
    chapter_id,
    excerpt,
    note
  ) VALUES
    (
      user_one_id,
      first_chapter_id,
      'real authenticated reader',
      'User one private lifecycle note'
    ),
    (
      user_two_id,
      first_chapter_id,
      'authenticated reader',
      'User two private lifecycle note'
    );
END
$$;
