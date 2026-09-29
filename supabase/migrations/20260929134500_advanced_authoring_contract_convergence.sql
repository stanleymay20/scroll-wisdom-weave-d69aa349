-- Advanced-authoring generation contract convergence.
--
-- Historical environments can contain the UI and generation code without the
-- durable book-level settings they depend on. Advanced authoring is GA-disabled,
-- but these additive columns make the book row the source of truth before any
-- specialized mode is reopened.

ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS workbook_density text,
  ADD COLUMN IF NOT EXISTS comic_style_id text,
  ADD COLUMN IF NOT EXISTS palette_hint text,
  ADD COLUMN IF NOT EXISTS line_weight_hint text,
  ADD COLUMN IF NOT EXISTS character_sheet jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS layout_template integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS text_in_image boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS scenes_per_panel integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS comic_sub_type text,
  ADD COLUMN IF NOT EXISTS comic_sub_type_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS character_sheet_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS comic_learning_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS fiction_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS style_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS target_chapter_words integer NOT NULL DEFAULT 4000;

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'books_workbook_density_valid'
      AND conrelid = 'public.books'::regclass
  ) THEN
    ALTER TABLE public.books
      ADD CONSTRAINT books_workbook_density_valid
      CHECK (workbook_density IS NULL OR workbook_density IN ('low','medium','high'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'books_layout_template_valid'
      AND conrelid = 'public.books'::regclass
  ) THEN
    ALTER TABLE public.books
      ADD CONSTRAINT books_layout_template_valid
      CHECK (layout_template BETWEEN 3 AND 6);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'books_target_chapter_words_valid'
      AND conrelid = 'public.books'::regclass
  ) THEN
    ALTER TABLE public.books
      ADD CONSTRAINT books_target_chapter_words_valid
      CHECK (target_chapter_words BETWEEN 500 AND 16000);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'books_scenes_per_panel_valid'
      AND conrelid = 'public.books'::regclass
  ) THEN
    ALTER TABLE public.books
      ADD CONSTRAINT books_scenes_per_panel_valid
      CHECK (scenes_per_panel BETWEEN 1 AND 3);
  END IF;
END
$constraints$;

COMMENT ON COLUMN public.books.fiction_config IS
  'Durable fiction contract: genre, POV, tone, setting, characters, plot points, themes.';
COMMENT ON COLUMN public.books.style_profile IS
  'Durable author style profile used by generation; never treated as an executable prompt.';
COMMENT ON COLUMN public.books.comic_sub_type_config IS
  'Durable comic subtype configuration for resumable chapter generation.';
COMMENT ON COLUMN public.books.comic_learning_config IS
  'Durable educational-comic learning configuration for resumable generation.';
