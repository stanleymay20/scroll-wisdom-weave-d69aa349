-- Publication readiness must reflect the most recent verdict for the exact
-- manuscript/chapter state. A later BLOCKED rerun must revoke an earlier PASS
-- on the same hash rather than coexisting with it as an evergreen authorization.

-- Use wall-clock time for new attestation rows so repeated gate evaluations in
-- one transaction retain issuance order rather than sharing transaction-start now().
ALTER TABLE public.publication_gate_attestations
  ALTER COLUMN created_at SET DEFAULT clock_timestamp();

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

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.has_current_publication_attestations(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_current_publication_attestations(uuid)
  TO service_role;
