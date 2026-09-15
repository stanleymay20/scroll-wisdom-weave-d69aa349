-- ScrollLibrary Contract 8 / 6B / 6C authoritative assessment sessions.
-- Correct answers and scoring evidence stay server-side. Browser clients interact
-- only through the assessment-session Edge Function.

CREATE TABLE IF NOT EXISTS public.assessment_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  chapter_id uuid NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('completion', 'mastery')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned')),
  questions jsonb NOT NULL,
  question_count integer NOT NULL CHECK (question_count > 0),
  tier_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  coding_question_count integer NOT NULL DEFAULT 0,
  assessment_contract_version text NOT NULL DEFAULT 'ARC-1.0',
  assessment_contract_passed boolean NOT NULL DEFAULT false,
  manifest_hash text NOT NULL,
  paste_count integer NOT NULL DEFAULT 0 CHECK (paste_count >= 0),
  focus_loss_count integer NOT NULL DEFAULT 0 CHECK (focus_loss_count >= 0),
  telemetry_heartbeats integer NOT NULL DEFAULT 0 CHECK (telemetry_heartbeats >= 0),
  suspicious_timing boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.assessment_session_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.assessment_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_index integer NOT NULL CHECK (question_index >= 0),
  selected_index integer NOT NULL CHECK (selected_index >= 0),
  is_correct boolean NOT NULL,
  answered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, question_index)
);

ALTER TABLE public.assessment_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_session_answers ENABLE ROW LEVEL SECURITY;

-- No direct browser access: correct answers are stored in assessment_sessions.questions.
REVOKE ALL ON TABLE public.assessment_sessions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.assessment_session_answers FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.assessment_sessions TO service_role;
GRANT ALL ON TABLE public.assessment_session_answers TO service_role;

ALTER TABLE public.quiz_attempts
  ADD COLUMN IF NOT EXISTS assessment_session_id uuid REFERENCES public.assessment_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assessment_contract_version text,
  ADD COLUMN IF NOT EXISTS assessment_contract_passed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS assessment_manifest_hash text,
  ADD COLUMN IF NOT EXISTS tier_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS coding_question_count integer NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS quiz_attempts_assessment_session_unique
  ON public.quiz_attempts(assessment_session_id)
  WHERE assessment_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS assessment_sessions_user_book_chapter
  ON public.assessment_sessions(user_id, book_id, chapter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS assessment_session_answers_session
  ON public.assessment_session_answers(session_id, question_index);

-- Compatibility: ensure the integrity table has the rich classification columns
-- expected by clean Contract 6D installs, without dropping legacy payload fields.
ALTER TABLE public.assessment_integrity_logs
  ADD COLUMN IF NOT EXISTS severity text,
  ADD COLUMN IF NOT EXISTS paste_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS focus_loss_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS suspicious_timing boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS session_duration_ms integer,
  ADD COLUMN IF NOT EXISTS quiz_attempt_id uuid REFERENCES public.quiz_attempts(id) ON DELETE CASCADE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.assessment_integrity_logs'::regclass
      AND conname = 'assessment_integrity_logs_severity_check'
  ) THEN
    NULL;
  ELSE
    ALTER TABLE public.assessment_integrity_logs
      ADD CONSTRAINT assessment_integrity_logs_severity_check
      CHECK (severity IS NULL OR severity IN ('trusted', 'review', 'reject'));
  END IF;
END
$$;
