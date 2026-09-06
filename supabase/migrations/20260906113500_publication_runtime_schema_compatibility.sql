-- Publication runtime compatibility baseline.
--
-- This migration is intentionally additive and idempotent. It closes the
-- minimum schema gap required by the current generation -> editorial audit ->
-- evidence verification -> deterministic QA -> publication gate pipeline,
-- without replaying unrelated legacy migrations or replacing legacy RLS.

-- ---------------------------------------------------------------------------
-- 1) Dual ownership compatibility
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS user_id uuid;

UPDATE public.profiles
SET user_id = id
WHERE user_id IS NULL;

ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS user_id uuid;

UPDATE public.books
SET user_id = creator_id
WHERE user_id IS NULL
  AND creator_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_books_user_id ON public.books(user_id);

-- Keep legacy-created records compatible with newer code without replacing
-- any existing ownership policies.
CREATE OR REPLACE FUNCTION public.sync_profile_user_id_compat()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    NEW.user_id := NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'sync_profile_user_id_compat_trigger'
      AND tgrelid = 'public.profiles'::regclass
  ) THEN
    CREATE TRIGGER sync_profile_user_id_compat_trigger
    BEFORE INSERT OR UPDATE OF id, user_id
    ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_profile_user_id_compat();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sync_book_user_id_compat()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NULL AND NEW.creator_id IS NOT NULL THEN
    NEW.user_id := NEW.creator_id;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'sync_book_user_id_compat_trigger'
      AND tgrelid = 'public.books'::regclass
  ) THEN
    CREATE TRIGGER sync_book_user_id_compat_trigger
    BEFORE INSERT OR UPDATE OF creator_id, user_id
    ON public.books
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_book_user_id_compat();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Generation job truth source
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  book_id uuid REFERENCES public.books(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'generating', 'completed', 'failed', 'partial')),
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

ALTER TABLE public.generation_jobs
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS book_id uuid REFERENCES public.books(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS current_chapter integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_chapters integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error_code text,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS started_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.generation_jobs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.generation_jobs TO authenticated;
GRANT ALL ON public.generation_jobs TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'generation_jobs'
      AND policyname = 'Users can view own generation jobs'
  ) THEN
    CREATE POLICY "Users can view own generation jobs"
      ON public.generation_jobs FOR SELECT TO authenticated
      USING ((SELECT auth.uid()) = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'generation_jobs'
      AND policyname = 'Users can create own generation jobs'
  ) THEN
    CREATE POLICY "Users can create own generation jobs"
      ON public.generation_jobs FOR INSERT TO authenticated
      WITH CHECK ((SELECT auth.uid()) = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'generation_jobs'
      AND policyname = 'Users can update own generation jobs'
  ) THEN
    CREATE POLICY "Users can update own generation jobs"
      ON public.generation_jobs FOR UPDATE TO authenticated
      USING ((SELECT auth.uid()) = user_id)
      WITH CHECK ((SELECT auth.uid()) = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_generation_jobs_user_book
  ON public.generation_jobs(user_id, book_id);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_book_created
  ON public.generation_jobs(book_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_active
  ON public.generation_jobs(status)
  WHERE status IN ('pending', 'generating');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'update_generation_jobs_updated_at'
      AND tgrelid = 'public.generation_jobs'::regclass
  ) THEN
    CREATE TRIGGER update_generation_jobs_updated_at
    BEFORE UPDATE ON public.generation_jobs
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3) Deterministic publishability QA reports
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.book_qa_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  score integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'blocked',
  blocker_count integer NOT NULL DEFAULT 0,
  warning_count integer NOT NULL DEFAULT 0,
  info_count integer NOT NULL DEFAULT 0,
  totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.book_qa_reports
  ADD COLUMN IF NOT EXISTS book_id uuid REFERENCES public.books(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'blocked',
  ADD COLUMN IF NOT EXISTS blocker_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS warning_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS info_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.book_qa_reports ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.book_qa_reports TO authenticated;
GRANT ALL ON public.book_qa_reports TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'book_qa_reports'
      AND policyname = 'Book owners can view their QA reports'
  ) THEN
    CREATE POLICY "Book owners can view their QA reports"
      ON public.book_qa_reports FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.books b
          WHERE b.id = book_qa_reports.book_id
            AND (
              b.creator_id = (SELECT auth.uid())
              OR b.user_id = (SELECT auth.uid())
            )
        )
        OR public.has_role((SELECT auth.uid()), 'admin')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS book_qa_reports_book_created_idx
  ON public.book_qa_reports(book_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 4) Truthful completion guard
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_generation_job_completion_truth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  chapter_count integer := 0;
  generated_count integer := 0;
  quality_ready boolean := false;
BEGIN
  IF NEW.status <> 'completed' OR NEW.book_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    count(*)::integer,
    count(*) FILTER (
      WHERE is_generated IS TRUE
        AND NULLIF(btrim(COALESCE(content, '')), '') IS NOT NULL
    )::integer
  INTO chapter_count, generated_count
  FROM public.chapters
  WHERE book_id = NEW.book_id;

  quality_ready := lower(
    COALESCE(NEW.metadata #>> '{publicationQuality,ready}', 'false')
  ) = 'true';

  IF chapter_count = 0
     OR generated_count < chapter_count
     OR quality_ready IS NOT TRUE THEN
    NEW.status := 'generating';
    NEW.current_chapter := generated_count;
    NEW.completed_at := NULL;
    NEW.error_code := NULL;
    NEW.error_message := NULL;
    NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) || jsonb_build_object(
      'phase', CASE
        WHEN generated_count < chapter_count THEN 'drafting'
        ELSE 'quality_review'
      END,
      'completion_guarded_at', now()
    );
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'generation_jobs_truthful_completion'
      AND tgrelid = 'public.generation_jobs'::regclass
  ) THEN
    CREATE TRIGGER generation_jobs_truthful_completion
    BEFORE INSERT OR UPDATE OF status, current_chapter, metadata, completed_at
    ON public.generation_jobs
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_generation_job_completion_truth();
  END IF;
END $$;

COMMENT ON FUNCTION public.enforce_generation_job_completion_truth() IS
'Prevents generation_jobs.status=completed until every chapter is generated and metadata.publicationQuality.ready=true.';

-- ---------------------------------------------------------------------------
-- 5) Verified publication gate
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_verified_publication_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  latest_status text;
  latest_metadata jsonb;
  quality_ready boolean := false;
BEGIN
  IF NEW.is_published IS NOT TRUE
     OR COALESCE(OLD.is_published, false) IS TRUE THEN
    RETURN NEW;
  END IF;

  SELECT status, metadata
  INTO latest_status, latest_metadata
  FROM public.generation_jobs
  WHERE book_id = NEW.id
  ORDER BY created_at DESC
  LIMIT 1;

  -- Manual/imported books with no generation history retain their legacy flow.
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  quality_ready := lower(
    COALESCE(latest_metadata #>> '{publicationQuality,ready}', 'false')
  ) = 'true';

  IF latest_status <> 'completed' OR quality_ready IS NOT TRUE THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'PUBLICATION_QUALITY_GATE_REQUIRED',
      DETAIL = 'Generated books cannot be published until editorial, evidence, and publishability gates pass.',
      HINT = 'Run the publication quality pipeline and resolve all blockers before publishing.';
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'books_verified_publication_gate'
      AND tgrelid = 'public.books'::regclass
  ) THEN
    CREATE TRIGGER books_verified_publication_gate
    BEFORE UPDATE OF is_published
    ON public.books
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_verified_publication_gate();
  END IF;
END $$;

COMMENT ON FUNCTION public.enforce_verified_publication_gate() IS
'Blocks publishing generated books until the latest generation job is completed with metadata.publicationQuality.ready=true.';
