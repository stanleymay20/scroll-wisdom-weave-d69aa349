-- Complete the forward-converged citation table to the current application contract.
ALTER TABLE public.book_citations
  ADD COLUMN IF NOT EXISTS chapter_id uuid REFERENCES public.chapters(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notes text;

CREATE INDEX IF NOT EXISTS book_citations_book_idx ON public.book_citations(book_id);
CREATE INDEX IF NOT EXISTS book_citations_chapter_idx ON public.book_citations(chapter_id) WHERE chapter_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS book_citations_doi_idx ON public.book_citations(doi) WHERE doi IS NOT NULL;

-- Citation records are author-managed evidence inputs, not server authority rows.
-- Reads/deletes are still limited by book ownership; inserts/updates are routed
-- through the authenticated Edge function for validation and deduplication.
GRANT DELETE ON public.book_citations TO authenticated;
DROP POLICY IF EXISTS book_citations_delete_owner ON public.book_citations;
CREATE POLICY book_citations_delete_owner ON public.book_citations
FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.books b
  WHERE b.id=book_citations.book_id
    AND (b.user_id=auth.uid() OR b.creator_id=auth.uid())
));
