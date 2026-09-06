-- Publication readiness requires an independent whole-book consistency verdict
-- in addition to editorial, evidence, publishability QA, and rendered-PDF proof.
--
-- Deployment order is intentional and fail-safe:
--   1. deploy cross-chapter-consistency-audit and certify-production-render,
--   2. deploy the publication pipeline that invokes both producers,
--   3. prove both can issue current-hash PASS attestations,
--   4. only then apply this migration.
--
-- Any later BLOCKED rerun, or any manuscript edit that changes the book hash,
-- revokes readiness until every required gate passes again for the new hash.

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

  -- Chief Editor verdict for this exact manuscript state.
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

  -- Independent whole-book consistency verdict. This is intentionally separate
  -- from the Chief Editor score so duplicate chapters, chronology conflicts,
  -- definition drift, or contradictory conclusions cannot hide inside an average.
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

  -- Deterministic publishability / rendering-risk QA verdict for this exact state.
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

  -- Evidence is chapter-scoped because a single bad chapter must block the book.
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

  -- The canonical PDF itself must pass byte-level production inspection for this
  -- exact manuscript hash. A beautiful render cannot rescue bad content, and a
  -- good manuscript cannot be certified from a corrupt/truncated production file.
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
