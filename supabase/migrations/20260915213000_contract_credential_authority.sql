-- ScrollLibrary contract GA hardening: credential evidence authority.
--
-- Browser clients may record interaction telemetry, but they may not mint
-- authoritative assessment or integrity evidence used by Contract 6C.

-- 1. Integrity logs are server-authoritative only.
REVOKE ALL ON FUNCTION public.insert_integrity_log(uuid, uuid, uuid, text, numeric, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_integrity_log(uuid, uuid, uuid, text, numeric, jsonb)
  TO service_role;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.assessment_integrity_logs
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.assessment_integrity_logs TO authenticated;
GRANT ALL ON TABLE public.assessment_integrity_logs TO service_role;

-- 2. Quiz results used for certification are server-authoritative.
-- Existing direct INSERT policy/privilege allowed a browser to choose score.
DROP POLICY IF EXISTS "Users can create their own quiz attempts" ON public.quiz_attempts;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.quiz_attempts
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.quiz_attempts TO authenticated;
GRANT ALL ON TABLE public.quiz_attempts TO service_role;

-- 3. Mastery attempts are likewise evidence, not user-authored data.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.mastery_attempts
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.mastery_attempts TO authenticated;
GRANT ALL ON TABLE public.mastery_attempts TO service_role;

-- 4. Persist the evidence needed to prove Contract 8/12 at issuance time.
ALTER TABLE public.publishing_certificates
  ADD COLUMN IF NOT EXISTS book_content_hash text,
  ADD COLUMN IF NOT EXISTS book_version text,
  ADD COLUMN IF NOT EXISTS coverage_percentage numeric(5,2),
  ADD COLUMN IF NOT EXISTS assessment_contract_version text,
  ADD COLUMN IF NOT EXISTS assessment_contract_passed boolean,
  ADD COLUMN IF NOT EXISTS evidence_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 5. The authoritative quiz table must identify the chapter it assessed.
CREATE UNIQUE INDEX IF NOT EXISTS quiz_attempts_one_numbered_attempt
  ON public.quiz_attempts(user_id, book_id, chapter_id, attempt_number);

-- 6. Contract invariants: browser roles must not regain evidence-write authority.
DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.quiz_attempts', 'INSERT') THEN
    RAISE EXCEPTION 'Contract 6C violation: authenticated must not INSERT authoritative quiz_attempts';
  END IF;
  IF has_table_privilege('authenticated', 'public.assessment_integrity_logs', 'INSERT') THEN
    RAISE EXCEPTION 'Contract 6B violation: authenticated must not INSERT integrity evidence';
  END IF;
  IF has_function_privilege(
    'authenticated',
    'public.insert_integrity_log(uuid, uuid, uuid, text, numeric, jsonb)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Contract 6B violation: authenticated must not invoke insert_integrity_log';
  END IF;
  IF has_table_privilege('authenticated', 'public.mastery_attempts', 'INSERT') THEN
    RAISE EXCEPTION 'Contract 6C violation: authenticated must not INSERT mastery evidence';
  END IF;
END
$$;
