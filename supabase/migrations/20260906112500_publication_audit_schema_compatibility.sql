-- Additive compatibility schema for the current Chief Editor pipeline.
-- Safe to replay: creates missing audit structures without dropping legacy data/policies.

CREATE TABLE IF NOT EXISTS public.book_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  structural_score numeric NOT NULL DEFAULT 0,
  academic_score numeric NOT NULL DEFAULT 0,
  pedagogical_score numeric NOT NULL DEFAULT 0,
  overall_score numeric NOT NULL DEFAULT 0,
  structural_findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  academic_findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  pedagogical_findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  flagged_sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  chapter_suggestions jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  improvements_applied boolean NOT NULL DEFAULT false,
  improvements_applied_at timestamptz,
  penalty_log jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence_citations jsonb NOT NULL DEFAULT '[]'::jsonb,
  pre_penalty_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  certification_eligible boolean NOT NULL DEFAULT false,
  certification_blockers text[] NOT NULL DEFAULT '{}',
  audit_model text NOT NULL DEFAULT 'google/gemini-2.5-flash',
  audit_prompt_version text NOT NULL DEFAULT 'v4.0',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.book_audits ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.book_audits TO authenticated;
GRANT ALL ON public.book_audits TO service_role;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='book_audits' AND policyname='Users can view own book audits') THEN
    CREATE POLICY "Users can view own book audits" ON public.book_audits FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='book_audits' AND policyname='Users can create own book audits') THEN
    CREATE POLICY "Users can create own book audits" ON public.book_audits FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='book_audits' AND policyname='Users can update own book audits') THEN
    CREATE POLICY "Users can update own book audits" ON public.book_audits FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='book_audits' AND policyname='Users can delete own book audits') THEN
    CREATE POLICY "Users can delete own book audits" ON public.book_audits FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_book_audits_updated_at' AND tgrelid='public.book_audits'::regclass) THEN
    CREATE TRIGGER update_book_audits_updated_at BEFORE UPDATE ON public.book_audits FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_book_audits_book_id ON public.book_audits(book_id);
CREATE INDEX IF NOT EXISTS idx_book_audits_user_id ON public.book_audits(user_id);

ALTER TABLE public.chapters
  ADD COLUMN IF NOT EXISTS version_number integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS previous_content text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS audit_id uuid DEFAULT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chapters_audit_id_fkey' AND conrelid='public.chapters'::regclass) THEN
    ALTER TABLE public.chapters ADD CONSTRAINT chapters_audit_id_fkey FOREIGN KEY (audit_id) REFERENCES public.book_audits(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_chapters_audit_id ON public.chapters(audit_id);

CREATE TABLE IF NOT EXISTS public.audit_telemetry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL REFERENCES public.book_audits(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  duration_ms integer NOT NULL DEFAULT 0,
  chapters_audited integer NOT NULL DEFAULT 0,
  penalties_applied integer NOT NULL DEFAULT 0,
  certification_result boolean NOT NULL DEFAULT false,
  score_before jsonb DEFAULT '{}'::jsonb,
  score_after jsonb DEFAULT '{}'::jsonb,
  improvement_delta jsonb DEFAULT '{}'::jsonb,
  audit_model text NOT NULL DEFAULT 'google/gemini-2.5-flash',
  prompt_version text NOT NULL DEFAULT 'v4.0',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_telemetry ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.audit_telemetry TO authenticated;
GRANT ALL ON public.audit_telemetry TO service_role;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='audit_telemetry' AND policyname='Users can view own telemetry') THEN
    CREATE POLICY "Users can view own telemetry" ON public.audit_telemetry FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='audit_telemetry' AND policyname='Users can insert own telemetry') THEN
    CREATE POLICY "Users can insert own telemetry" ON public.audit_telemetry FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_audit_telemetry_book ON public.audit_telemetry(book_id);
CREATE INDEX IF NOT EXISTS idx_audit_telemetry_created ON public.audit_telemetry(created_at);
