-- Fail closed for AI-generated books that have a generation job.
-- A book with generation history may only transition to published after the
-- closed-loop publication pipeline has completed and persisted its verified
-- publication-quality verdict. Imported/manual books with no generation job
-- retain their existing publication workflow.

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

  -- No generation job means this is outside the AI-generation completion
  -- contract (for example, an imported/manual book). Preserve legacy flow.
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  quality_ready := CASE
    WHEN lower(COALESCE(latest_metadata #>> '{publicationQuality,ready}', 'false')) = 'true'
      THEN true
    ELSE false
  END;

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

DROP TRIGGER IF EXISTS books_verified_publication_gate ON public.books;

CREATE TRIGGER books_verified_publication_gate
BEFORE UPDATE OF is_published
ON public.books
FOR EACH ROW
EXECUTE FUNCTION public.enforce_verified_publication_gate();

COMMENT ON FUNCTION public.enforce_verified_publication_gate() IS
'Blocks publishing generated books until the latest generation job is completed with metadata.publicationQuality.ready=true.';
