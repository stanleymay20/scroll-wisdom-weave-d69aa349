-- GA correctness: certification requires durable per-chapter reading evidence.
--
-- The original marketplace table allowed only one row per user/book while the
-- certificate authority counts coverage per chapter. That made multi-chapter
-- certification impossible. Preserve the same table/RLS contract, but move the
-- uniqueness boundary to user + book + chapter. NULLS NOT DISTINCT keeps a
-- single optional book-level resume row if one is ever used.

ALTER TABLE public.reading_progress
  DROP CONSTRAINT IF EXISTS reading_progress_user_id_book_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS reading_progress_user_book_chapter_unique
  ON public.reading_progress (user_id, book_id, chapter_id) NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS idx_reading_progress_user_book_recent
  ON public.reading_progress(user_id, book_id, last_read_at DESC);

DO $assert$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid='public.reading_progress'::regclass
      AND conname='reading_progress_user_id_book_id_key'
  ) THEN
    RAISE EXCEPTION 'GA reading-progress convergence failed: legacy user/book uniqueness remains';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public'
      AND tablename='reading_progress'
      AND indexname='reading_progress_user_book_chapter_unique'
  ) THEN
    RAISE EXCEPTION 'GA reading-progress convergence failed: per-chapter uniqueness missing';
  END IF;
END
$assert$;
