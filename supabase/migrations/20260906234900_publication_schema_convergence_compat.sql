-- Reconcile the historical Publication table with the later live-convergence
-- shape before 20260906235000 runs.
--
-- The canonical Publication table was created in June 2026 without book_id or
-- design_snapshot. The later convergence migration uses CREATE TABLE IF NOT
-- EXISTS, which cannot add columns to an existing relation, then immediately
-- indexes book_id and reads design_snapshot from the immutability trigger.
--
-- Both additions are nullable and additive. Existing Publication rows retain
-- their original work identity and immutable snapshot without fabricated book
-- links or design evidence.

ALTER TABLE public.publications
  ADD COLUMN IF NOT EXISTS book_id uuid REFERENCES public.books(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS design_snapshot jsonb;

CREATE INDEX IF NOT EXISTS publications_book_idx
  ON public.publications(book_id);
