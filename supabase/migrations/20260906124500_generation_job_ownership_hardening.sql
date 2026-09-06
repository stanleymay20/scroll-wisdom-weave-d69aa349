-- generation_jobs influences whether a book is treated as AI-generated and
-- therefore whether publication attestations are mandatory. Browser users must
-- not be able to create or retarget jobs onto books they do not own.

-- The generate-book Edge Function creates jobs with the service role. Browser
-- code only needs to read its own jobs and update workflow/error state.
REVOKE ALL ON TABLE public.generation_jobs FROM anon;
REVOKE INSERT, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.generation_jobs FROM authenticated;
GRANT SELECT, UPDATE ON TABLE public.generation_jobs TO authenticated;
GRANT ALL ON TABLE public.generation_jobs TO service_role;

DROP POLICY IF EXISTS "Users can create own generation jobs"
  ON public.generation_jobs;

DROP POLICY IF EXISTS "Users can update own generation jobs"
  ON public.generation_jobs;

CREATE POLICY "Users can update own generation jobs"
  ON public.generation_jobs
  FOR UPDATE TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND (
      book_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.books b
        WHERE b.id = generation_jobs.book_id
          AND (
            b.user_id = (SELECT auth.uid())
            OR b.creator_id = (SELECT auth.uid())
          )
      )
    )
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (
      book_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.books b
        WHERE b.id = generation_jobs.book_id
          AND (
            b.user_id = (SELECT auth.uid())
            OR b.creator_id = (SELECT auth.uid())
          )
      )
    )
  );

-- These historical browser-mutation policies are intentionally removed now
-- that book_audits is an immutable server-authored certification artifact.
DROP POLICY IF EXISTS "Users can create own book audits"
  ON public.book_audits;
DROP POLICY IF EXISTS "Users can update own book audits"
  ON public.book_audits;
DROP POLICY IF EXISTS "Users can delete own book audits"
  ON public.book_audits;
