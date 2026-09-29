-- A chapter write and its worker lease check must be one transaction.
-- A request that started with a valid lease may finish after a retry or edit.
CREATE OR REPLACE FUNCTION public.save_generated_chapter_fenced(
  _chapter_id uuid, _user_id uuid, _expected_content text, _patch jsonb,
  _job_id uuid DEFAULT NULL, _worker_token uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _job public.generation_jobs%ROWTYPE;
  _chapter public.chapters%ROWTYPE;
  _new public.chapters%ROWTYPE;
BEGIN
  IF _chapter_id IS NULL OR _user_id IS NULL OR _patch IS NULL
     OR jsonb_typeof(_patch) <> 'object'
     OR COALESCE(_patch->>'content', '') = '' THEN
    RETURN false;
  END IF;
  IF (_job_id IS NULL) <> (_worker_token IS NULL) THEN RETURN false; END IF;

  -- Use the same job-row lock as lease acquisition; another worker cannot
  -- acquire the job between validation and saving chapter content.
  IF _job_id IS NOT NULL THEN
    SELECT * INTO _job FROM public.generation_jobs WHERE id = _job_id FOR UPDATE;
    IF NOT FOUND OR _job.user_id IS DISTINCT FROM _user_id
       OR _job.status <> 'generating'
       OR _job.worker_lease_token IS DISTINCT FROM _worker_token
       OR _job.worker_lease_until IS NULL
       OR _job.worker_lease_until <= clock_timestamp() THEN RETURN false; END IF;
  END IF;

  SELECT * INTO _chapter FROM public.chapters WHERE id = _chapter_id FOR UPDATE;
  IF NOT FOUND OR _chapter.content IS DISTINCT FROM _expected_content THEN RETURN false; END IF;
  IF _job_id IS NOT NULL AND (_chapter.book_id IS DISTINCT FROM _job.book_id
       OR _chapter.is_generated IS TRUE) THEN RETURN false; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.books b WHERE b.id = _chapter.book_id
    AND (b.creator_id = _user_id OR b.user_id = _user_id
         OR public.has_role(_user_id, 'admin'::public.app_role))
  ) THEN RETURN false; END IF;

  _new := jsonb_populate_record(_chapter, _patch);
  -- Never accept identity, ownership, chapter number or caller success flags.
  UPDATE public.chapters SET
    content = _new.content, word_count = _new.word_count,
    is_generated = true, updated_at = clock_timestamp(),
    academic_mode = _new.academic_mode, citation_style = _new.citation_style,
    comic_metadata = _new.comic_metadata,
    chapter_references = _new.chapter_references,
    research_metadata = _new.research_metadata
  WHERE id = _chapter_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.save_generated_chapter_fenced(uuid,uuid,text,jsonb,uuid,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_generated_chapter_fenced(uuid,uuid,text,jsonb,uuid,uuid)
  TO service_role;
