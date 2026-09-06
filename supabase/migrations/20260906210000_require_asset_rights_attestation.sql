-- Final publication-readiness contract: content quality, whole-book consistency,
-- evidence where required, media rights, and the actual rendered PDF must all pass
-- for the exact same publication hash.
--
-- SAFE DEPLOYMENT ORDER:
--   1. apply book_asset_provenance + publication-asset hash migrations,
--   2. apply future-asset rights minimum constraint,
--   3. deploy generate-cover wrapper/raw producer + register-custom-cover,
--      certify-asset-rights, consistency, production and finalizer functions,
--   4. prove current-hash structural/rights/production PASS can be issued,
--   5. only then apply this migration.
--
-- Do not apply this migration ahead of its producers. It is intentionally the
-- final cutover because missing rights evidence must fail closed.

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
  v_latest_status text;
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

  -- Chief Editor verdict.
  SELECT a.status
  INTO v_latest_status
  FROM public.publication_gate_attestations a
  WHERE a.book_id = p_book_id
    AND a.gate = 'editorial'
    AND a.scope = 'book'
    AND a.scope_hash = v_book_hash
  ORDER BY a.created_at DESC, a.id DESC
  LIMIT 1;

  IF COALESCE(v_latest_status, 'blocked') <> 'passed' THEN
    RETURN false;
  END IF;

  -- Independent whole-book consistency verdict.
  v_latest_status := NULL;
  SELECT a.status
  INTO v_latest_status
  FROM public.publication_gate_attestations a
  WHERE a.book_id = p_book_id
    AND a.gate = 'structural'
    AND a.scope = 'book'
    AND a.scope_hash = v_book_hash
  ORDER BY a.created_at DESC, a.id DESC
  LIMIT 1;

  IF COALESCE(v_latest_status, 'blocked') <> 'passed' THEN
    RETURN false;
  END IF;

  -- Deterministic publishability / rendering-risk QA verdict.
  v_latest_status := NULL;
  SELECT a.status
  INTO v_latest_status
  FROM public.publication_gate_attestations a
  WHERE a.book_id = p_book_id
    AND a.gate = 'qa'
    AND a.scope = 'book'
    AND a.scope_hash = v_book_hash
  ORDER BY a.created_at DESC, a.id DESC
  LIMIT 1;

  IF COALESCE(v_latest_status, 'blocked') <> 'passed' THEN
    RETURN false;
  END IF;

  -- Evidence is chapter-scoped because one unsupported chapter blocks the book.
  v_evidence_required := public.book_requires_publication_evidence(p_book_id);
  IF v_evidence_required THEN
    SELECT count(*)::integer
    INTO v_evidence_passed
    FROM public.chapters c
    WHERE c.book_id = p_book_id
      AND COALESCE((
        SELECT a.status = 'passed'
        FROM public.publication_gate_attestations a
        WHERE a.book_id = p_book_id
          AND a.chapter_id = c.id
          AND a.gate = 'evidence'
          AND a.scope = 'chapter'
          AND a.scope_hash = public.compute_chapter_publication_hash(c.id)
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT 1
      ), false);

    IF v_evidence_passed < v_chapter_count THEN
      RETURN false;
    END IF;
  END IF;

  -- Every active publication asset and the current cover must have sufficient,
  -- server-verifiable publication rights for this exact media-bound book hash.
  v_latest_status := NULL;
  SELECT a.status
  INTO v_latest_status
  FROM public.publication_gate_attestations a
  WHERE a.book_id = p_book_id
    AND a.gate = 'rights'
    AND a.scope = 'book'
    AND a.scope_hash = v_book_hash
  ORDER BY a.created_at DESC, a.id DESC
  LIMIT 1;

  IF COALESCE(v_latest_status, 'blocked') <> 'passed' THEN
    RETURN false;
  END IF;

  -- The actual canonical PDF must have passed byte-level production inspection.
  v_latest_status := NULL;
  SELECT a.status
  INTO v_latest_status
  FROM public.publication_gate_attestations a
  WHERE a.book_id = p_book_id
    AND a.gate = 'production'
    AND a.scope = 'book'
    AND a.scope_hash = v_book_hash
  ORDER BY a.created_at DESC, a.id DESC
  LIMIT 1;

  IF COALESCE(v_latest_status, 'blocked') <> 'passed' THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.has_current_publication_attestations(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_current_publication_attestations(uuid)
  TO service_role;
