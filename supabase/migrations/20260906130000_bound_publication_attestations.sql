-- Bind publication gate verdicts to the exact manuscript/chapter state that was
-- inspected. Producers capture a scope hash before substantive evaluation and
-- must present that same hash when recording the verdict. If the scope changed
-- while an audit was running, issuance fails closed.

CREATE OR REPLACE FUNCTION public.record_publication_gate_attestation_bound(
  p_book_id uuid,
  p_user_id uuid,
  p_gate text,
  p_status text,
  p_expected_scope_hash text,
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
  v_current_hash text;
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

  IF p_expected_scope_hash IS NULL
     OR p_expected_scope_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'INVALID_PUBLICATION_SCOPE_HASH',
      DETAIL = 'Expected publication scope hash must be a lowercase 64-character SHA-256 hex digest.';
  END IF;

  IF p_chapter_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.chapters c
      WHERE c.id = p_chapter_id
        AND c.book_id = p_book_id
    ) THEN
      RAISE EXCEPTION 'chapter does not belong to book';
    END IF;
    v_current_hash := public.compute_chapter_publication_hash(p_chapter_id);
  ELSE
    v_current_hash := public.compute_book_publication_hash(p_book_id);
  END IF;

  IF v_current_hash IS NULL THEN
    RAISE EXCEPTION 'unable to compute publication scope hash';
  END IF;

  IF v_current_hash <> p_expected_scope_hash THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'PUBLICATION_SCOPE_CHANGED',
      DETAIL = 'The publication scope changed after evaluation began; the verdict was not recorded.',
      HINT = 'Reload the persisted scope and rerun the publication gate.';
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
    p_expected_scope_hash,
    COALESCE(p_artifact, '{}'::jsonb),
    p_source_record_id
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_publication_gate_attestation_bound(
  uuid, uuid, text, text, text, jsonb, uuid, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_publication_gate_attestation_bound(
  uuid, uuid, text, text, text, jsonb, uuid, uuid
) TO service_role;

-- Intentionally keep the legacy unbound service-role RPC executable in this
-- migration. It is revoked only after every server producer has migrated to the
-- bound API, avoiding a deployment-order outage between schema and functions.
