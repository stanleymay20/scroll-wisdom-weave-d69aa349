-- Harden the closed-loop completion and publication gates.
-- These trigger functions need cross-table visibility, but direct invocation by
-- client roles is explicitly revoked.

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

  quality_ready := lower(COALESCE(NEW.metadata #>> '{publicationQuality,ready}', 'false')) = 'true';

  IF chapter_count = 0 OR generated_count < chapter_count OR quality_ready IS NOT TRUE THEN
    NEW.status := 'generating';
    NEW.current_chapter := generated_count;
    NEW.completed_at := NULL;
    NEW.error_code := NULL;
    NEW.error_message := NULL;
    NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) || jsonb_build_object(
      'phase', CASE WHEN generated_count < chapter_count THEN 'drafting' ELSE 'quality_review' END,
      'completion_guarded_at', now()
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_generation_job_completion_truth() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_generation_job_completion_truth() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_generation_job_completion_truth() FROM authenticated;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='generation_jobs_truthful_completion' AND tgrelid='public.generation_jobs'::regclass) THEN
    CREATE TRIGGER generation_jobs_truthful_completion
    BEFORE INSERT OR UPDATE OF status, current_chapter, metadata, completed_at
    ON public.generation_jobs
    FOR EACH ROW EXECUTE FUNCTION public.enforce_generation_job_completion_truth();
  END IF;
END $$;

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
  IF NEW.is_published IS NOT TRUE OR COALESCE(OLD.is_published, false) IS TRUE THEN
    RETURN NEW;
  END IF;

  SELECT status, metadata
  INTO latest_status, latest_metadata
  FROM public.generation_jobs
  WHERE book_id = NEW.id
  ORDER BY created_at DESC
  LIMIT 1;

  -- Manual/imported books with no generation history retain the legacy path.
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  quality_ready := lower(COALESCE(latest_metadata #>> '{publicationQuality,ready}', 'false')) = 'true';

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

REVOKE ALL ON FUNCTION public.enforce_verified_publication_gate() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_verified_publication_gate() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_verified_publication_gate() FROM authenticated;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='books_verified_publication_gate' AND tgrelid='public.books'::regclass) THEN
    CREATE TRIGGER books_verified_publication_gate
    BEFORE UPDATE OF is_published ON public.books
    FOR EACH ROW EXECUTE FUNCTION public.enforce_verified_publication_gate();
  END IF;
END $$;
