-- GA production convergence for assessment + credential authority.
-- Restores columns lost by older hosted snapshots before replaying the idempotent
-- Contract 6B/6C/8/12 authority migration.

-- Hosted assessment schema convergence before credential authority.
ALTER TABLE public.quiz_attempts
  ADD COLUMN IF NOT EXISTS correct_answers integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS time_spent_seconds integer,
  ADD COLUMN IF NOT EXISTS attempt_number integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz NOT NULL DEFAULT now();

-- The authoritative assessment path always binds an attempt to a chapter.
DO $quiz_shape$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.quiz_attempts WHERE chapter_id IS NULL) THEN
    ALTER TABLE public.quiz_attempts ALTER COLUMN chapter_id SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.quiz_attempts WHERE score IS NULL) THEN
    ALTER TABLE public.quiz_attempts ALTER COLUMN score SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.quiz_attempts WHERE total_questions IS NULL) THEN
    ALTER TABLE public.quiz_attempts ALTER COLUMN total_questions SET NOT NULL;
  END IF;
END
$quiz_shape$;

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

DO $ga_credential_assert$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='publishing_certificates'
      AND column_name='book_content_hash'
  ) THEN
    RAISE EXCEPTION 'GA credential convergence failed: book_content_hash missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='publishing_certificates'
      AND column_name='evidence_snapshot'
  ) THEN
    RAISE EXCEPTION 'GA credential convergence failed: evidence_snapshot missing';
  END IF;
  IF has_table_privilege('authenticated', 'public.quiz_attempts', 'INSERT') THEN
    RAISE EXCEPTION 'GA credential convergence failed: browser can insert quiz evidence';
  END IF;
  IF has_table_privilege('authenticated', 'public.assessment_integrity_logs', 'INSERT') THEN
    RAISE EXCEPTION 'GA credential convergence failed: browser can insert integrity evidence';
  END IF;
  IF has_table_privilege('authenticated', 'public.mastery_attempts', 'INSERT') THEN
    RAISE EXCEPTION 'GA credential convergence failed: browser can insert mastery evidence';
  END IF;
END
$ga_credential_assert$;
