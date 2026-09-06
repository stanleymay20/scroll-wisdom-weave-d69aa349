-- Make publication completion and publication visibility derive from current,
-- service-owned attestations instead of browser-writable workflow metadata.

CREATE OR REPLACE FUNCTION public.book_requires_publication_evidence(p_book_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT
      b.category::text = ANY (ARRAY[
        'theology','science','technology','medicine','law','history',
        'philosophy','economics','finance','governance','african_studies'
      ]::text[])
      OR lower(COALESCE(b.book_type, '')) = ANY (
        ARRAY['academic','technical','reference','professional']::text[]
      )
    FROM public.books b
    WHERE b.id = p_book_id
  ), false);
$$;

REVOKE ALL ON FUNCTION public.book_requires_publication_evidence(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.book_requires_publication_evidence(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.record_publication_gate_attestation(
  p_book_id uuid,
  p_user_id uuid,
  p_gate text,
  p_status text,
  p_artifact jsonb DEFAULT '{}'::jsonb,
  p_source_record_id uuid DEFAULT NULL,
  p_chapter_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_hash text;
  v_id uuid;
BEGIN
  IF p_book_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'book_id and user_id are required';
  END IF;

  IF p_gate NOT IN ('editorial', 'evidence', 'qa', 'structural', 'production', 'rights') THEN
    RAISE EXCEPTION 'unsupported publication gate: %', p_gate;
  END IF;

  IF p_status NOT IN ('passed', 'blocked') THEN
    RAISE EXCEPTION 'unsupported publication gate status: %', p_status;
  END IF;

  IF p_chapter_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.chapters c
      WHERE c.id = p_chapter_id AND c.book_id = p_book_id
    ) THEN
      RAISE EXCEPTION 'chapter does not belong to book';
    END IF;
    v_hash := public.compute_chapter_publication_hash(p_chapter_id);
  ELSE
    v_hash := public.compute_book_publication_hash(p_book_id);
  END IF;

  IF v_hash IS NULL THEN
    RAISE EXCEPTION 'unable to compute publication scope hash';
  END IF;

  INSERT INTO public.publication_gate_attestations (
    book_id,
    chapter_id,
    user_id,
    gate,
    scope,
    status,
    scope_hash,
    artifact,
    source_record_id
  ) VALUES (
    p_book_id,
    p_chapter_id,
    p_user_id,
    p_gate,
    CASE WHEN p_chapter_id IS NULL THEN 'book' ELSE 'chapter' END,
    p_status,
    v_hash,
    COALESCE(p_artifact, '{}'::jsonb),
    p_source_record_id
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_publication_gate_attestation(
  uuid, uuid, text, text, jsonb, uuid, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_publication_gate_attestation(
  uuid, uuid, text, text, jsonb, uuid, uuid
) TO service_role;

CREATE OR REPLACE FUNCTION public.has_current_publication_attestations(p_book_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_book_hash text;
  v_chapter_count integer := 0;
  v_generated_count integer := 0;
  v_evidence_required boolean := false;
  v_evidence_passed integer := 0;
BEGIN
  SELECT
    count(*)::integer,
    count(*) FILTER (
      WHERE c.is_generated IS TRUE
        AND NULLIF(btrim(COALESCE(c.content, '')), '') IS NOT NULL
    )::integer
  INTO v_chapter_count, v_generated_count
  FROM public.chapters c
  WHERE c.book_id = p_book_id;

  IF v_chapter_count = 0 OR v_generated_count < v_chapter_count THEN
    RETURN false;
  END IF;

  v_book_hash := public.compute_book_publication_hash(p_book_id);
  IF v_book_hash IS NULL THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.publication_gate_attestations a
    WHERE a.book_id = p_book_id
      AND a.gate = 'editorial'
      AND a.scope = 'book'
      AND a.status = 'passed'
      AND a.scope_hash = v_book_hash
  ) THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.publication_gate_attestations a
    WHERE a.book_id = p_book_id
      AND a.gate = 'qa'
      AND a.scope = 'book'
      AND a.status = 'passed'
      AND a.scope_hash = v_book_hash
  ) THEN
    RETURN false;
  END IF;

  v_evidence_required := public.book_requires_publication_evidence(p_book_id);
  IF v_evidence_required THEN
    SELECT count(*)::integer
    INTO v_evidence_passed
    FROM public.chapters c
    WHERE c.book_id = p_book_id
      AND EXISTS (
        SELECT 1
        FROM public.publication_gate_attestations a
        WHERE a.book_id = p_book_id
          AND a.chapter_id = c.id
          AND a.gate = 'evidence'
          AND a.scope = 'chapter'
          AND a.status = 'passed'
          AND a.scope_hash = public.compute_chapter_publication_hash(c.id)
      );

    IF v_evidence_passed < v_chapter_count THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.has_current_publication_attestations(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_current_publication_attestations(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_generation_job_completion_truth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  chapter_count integer := 0;
  generated_count integer := 0;
  quality_ready boolean := false;
  publication_quality jsonb;
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

  quality_ready := public.has_current_publication_attestations(NEW.book_id);

  publication_quality := COALESCE(NEW.metadata -> 'publicationQuality', '{}'::jsonb)
    || jsonb_build_object(
      'ready', quality_ready,
      'authority', 'server_attestations',
      'checkedAt', now()
    );
  NEW.metadata := jsonb_set(
    COALESCE(NEW.metadata, '{}'::jsonb),
    '{publicationQuality}',
    publication_quality,
    true
  );

  IF chapter_count = 0 OR generated_count < chapter_count OR quality_ready IS NOT TRUE THEN
    NEW.status := CASE
      WHEN chapter_count = 0 OR generated_count < chapter_count THEN 'generating'
      ELSE 'partial'
    END;
    NEW.current_chapter := generated_count;
    NEW.completed_at := NULL;
    NEW.error_code := CASE
      WHEN chapter_count = 0 OR generated_count < chapter_count THEN NULL
      ELSE 'QUALITY_GATE_REQUIRED'
    END;
    NEW.error_message := CASE
      WHEN chapter_count = 0 OR generated_count < chapter_count THEN NULL
      ELSE 'Current server-attested publication gates are required before completion.'
    END;
    NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) || jsonb_build_object(
      'phase', CASE
        WHEN chapter_count = 0 OR generated_count < chapter_count THEN 'drafting'
        ELSE 'quality_review'
      END,
      'completion_guarded_at', now()
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_verified_publication_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  has_generation_history boolean := false;
BEGIN
  IF NEW.is_published IS NOT TRUE OR COALESCE(OLD.is_published, false) IS TRUE THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.generation_jobs
    WHERE book_id = NEW.id
  ) INTO has_generation_history;

  -- Preserve the legacy/manual publication path for books that were never created
  -- by the generated-book workflow. Generated books must use server attestations.
  IF has_generation_history IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  IF public.has_current_publication_attestations(NEW.id) IS NOT TRUE THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'PUBLICATION_QUALITY_GATE_REQUIRED',
      DETAIL = 'Generated books cannot be published until current server-attested editorial, evidence (when required), and publishability gates pass.',
      HINT = 'Run the publication quality pipeline again after any manuscript or publication-relevant metadata change.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_generation_job_completion_truth()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_verified_publication_gate()
  FROM PUBLIC, anon, authenticated;
