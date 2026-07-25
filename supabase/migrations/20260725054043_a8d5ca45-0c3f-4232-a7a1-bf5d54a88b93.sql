
CREATE TABLE public.book_qa_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  score INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('ready','needs_review','blocked')),
  blocker_count INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  info_count INTEGER NOT NULL DEFAULT 0,
  totals JSONB NOT NULL DEFAULT '{}'::jsonb,
  issues JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX book_qa_reports_book_created_idx
  ON public.book_qa_reports (book_id, created_at DESC);

GRANT SELECT ON public.book_qa_reports TO authenticated;
GRANT ALL ON public.book_qa_reports TO service_role;

ALTER TABLE public.book_qa_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Book owners can view their QA reports"
  ON public.book_qa_reports FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.books b
      WHERE b.id = book_qa_reports.book_id
        AND b.user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin')
  );
