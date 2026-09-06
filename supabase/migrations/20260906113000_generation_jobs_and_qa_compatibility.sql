-- Additive storage for generation progress and deterministic publishability QA.

CREATE TABLE IF NOT EXISTS public.generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  book_id uuid REFERENCES public.books(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','generating','completed','failed','partial')),
  current_chapter integer NOT NULL DEFAULT 0,
  total_chapters integer NOT NULL DEFAULT 0,
  error_code text,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.generation_jobs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.generation_jobs TO authenticated;
GRANT ALL ON public.generation_jobs TO service_role;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='generation_jobs' AND policyname='Users can view own generation jobs') THEN
    CREATE POLICY "Users can view own generation jobs" ON public.generation_jobs FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='generation_jobs' AND policyname='Users can create own generation jobs') THEN
    CREATE POLICY "Users can create own generation jobs" ON public.generation_jobs FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='generation_jobs' AND policyname='Users can update own generation jobs') THEN
    CREATE POLICY "Users can update own generation jobs" ON public.generation_jobs FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='generation_jobs' AND policyname='Admins can view all generation jobs') THEN
    CREATE POLICY "Admins can view all generation jobs" ON public.generation_jobs FOR SELECT TO authenticated USING (public.has_role((SELECT auth.uid()), 'admin'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_generation_jobs_updated_at' AND tgrelid='public.generation_jobs'::regclass) THEN
    CREATE TRIGGER update_generation_jobs_updated_at BEFORE UPDATE ON public.generation_jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_generation_jobs_user_book ON public.generation_jobs(user_id, book_id);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_status ON public.generation_jobs(status) WHERE status IN ('pending','generating');

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='generation_jobs') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.generation_jobs;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.book_qa_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  score integer NOT NULL DEFAULT 0,
  status text NOT NULL CHECK (status IN ('ready','needs_review','blocked')),
  blocker_count integer NOT NULL DEFAULT 0,
  warning_count integer NOT NULL DEFAULT 0,
  info_count integer NOT NULL DEFAULT 0,
  totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.book_qa_reports ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.book_qa_reports TO authenticated;
GRANT ALL ON public.book_qa_reports TO service_role;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='book_qa_reports' AND policyname='Book owners can view their QA reports') THEN
    CREATE POLICY "Book owners can view their QA reports" ON public.book_qa_reports FOR SELECT TO authenticated USING (
      EXISTS (
        SELECT 1 FROM public.books b
        WHERE b.id = book_qa_reports.book_id
          AND (b.user_id = (SELECT auth.uid()) OR b.creator_id = (SELECT auth.uid()))
      )
      OR public.has_role((SELECT auth.uid()), 'admin')
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS book_qa_reports_book_created_idx ON public.book_qa_reports(book_id, created_at DESC);
