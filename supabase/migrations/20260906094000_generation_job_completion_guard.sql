-- A generation job is only truly complete when every chapter exists as generated
-- content AND the closed-loop publication pipeline has recorded a passing quality
-- verdict. This prevents outline creation (or any other caller) from prematurely
-- representing a draft as a finished publication candidate.

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

  quality_ready := COALESCE(
    (NEW.metadata #>> '{publicationQuality,ready}')::boolean,
    false
  );

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

DROP TRIGGER IF EXISTS generation_jobs_truthful_completion ON public.generation_jobs;

CREATE TRIGGER generation_jobs_truthful_completion
BEFORE INSERT OR UPDATE OF status, current_chapter, metadata, completed_at
ON public.generation_jobs
FOR EACH ROW
EXECUTE FUNCTION public.enforce_generation_job_completion_truth();

COMMENT ON FUNCTION public.enforce_generation_job_completion_truth() IS
'Prevents generation_jobs.status=completed until all chapters are generated and metadata.publicationQuality.ready=true.';
