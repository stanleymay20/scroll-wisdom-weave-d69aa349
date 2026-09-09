-- Guarded compatibility repair for the legacy ScrollLibrary GA staging database.
--
-- A verified legacy staging lineage can already contain the modern
-- Work/Publication spine while its existing `publications` table predates the
-- canonical `book_id` link expected by the live publication convergence
-- migration. This migration is intentionally additive and fail-closed.
--
-- It does not create or alter Publication rows, Work rows, rights records,
-- certificates, products, imprints, or ISBN records. If a legacy database has
-- Publication data but lacks the column, convergence stops for a bespoke
-- data-preserving plan instead of guessing historical book identity.

DO $$
BEGIN
  IF to_regclass('public.publications') IS NULL THEN
    RAISE EXCEPTION 'LEGACY_STAGING_PUBLICATIONS_TABLE_MISSING'
      USING ERRCODE = '55000';
  END IF;

  IF to_regclass('public.books') IS NULL THEN
    RAISE EXCEPTION 'LEGACY_STAGING_BOOKS_TABLE_MISSING'
      USING ERRCODE = '55000';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'publications'
      AND column_name = 'book_id'
  ) THEN
    IF EXISTS (SELECT 1 FROM public.publications LIMIT 1) THEN
      RAISE EXCEPTION 'LEGACY_STAGING_PUBLICATIONS_BOOK_ID_REQUIRES_EMPTY_PUBLICATIONS'
        USING ERRCODE = '55000';
    END IF;

    ALTER TABLE public.publications
      ADD COLUMN book_id uuid REFERENCES public.books(id) ON DELETE SET NULL;
  END IF;
END;
$$;

COMMENT ON COLUMN public.publications.book_id IS
  'Optional source-book link used by the canonical immutable Publication spine; guarded compatibility backfill adds only the empty-schema column, never historical values.';
