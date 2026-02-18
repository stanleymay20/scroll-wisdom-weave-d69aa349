
CREATE TABLE public.audit_telemetry (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
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
  prompt_version text NOT NULL DEFAULT 'v2.1',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_telemetry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own telemetry"
  ON public.audit_telemetry FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own telemetry"
  ON public.audit_telemetry FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_audit_telemetry_book ON public.audit_telemetry(book_id);
CREATE INDEX idx_audit_telemetry_created ON public.audit_telemetry(created_at);
