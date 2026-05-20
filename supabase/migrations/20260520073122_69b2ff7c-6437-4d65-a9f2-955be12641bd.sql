
-- ============================================================
-- Phase 2.1a: Reliability & Observability foundation
-- ============================================================

-- 1) financial_events: append-only structured log for money-touching actions
CREATE TABLE IF NOT EXISTS public.financial_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warn','error','critical')),
  actor text NOT NULL DEFAULT 'system' CHECK (actor IN ('system','admin','user','webhook')),
  correlation_id text,
  purchase_id uuid,
  stripe_event_id text,
  user_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  dead_letter_reason text,
  dead_lettered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS financial_events_type_created_idx ON public.financial_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS financial_events_correlation_idx ON public.financial_events(correlation_id) WHERE correlation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS financial_events_purchase_idx ON public.financial_events(purchase_id) WHERE purchase_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS financial_events_severity_idx ON public.financial_events(severity, created_at DESC) WHERE severity IN ('error','critical');

ALTER TABLE public.financial_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read financial_events"
  ON public.financial_events FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Append-only enforcement
CREATE OR REPLACE FUNCTION public.block_financial_events_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'financial_events is append-only (op=%)', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS financial_events_no_update ON public.financial_events;
CREATE TRIGGER financial_events_no_update
  BEFORE UPDATE OR DELETE ON public.financial_events
  FOR EACH ROW EXECUTE FUNCTION public.block_financial_events_mutation();

-- 2) stripe_webhook_events: idempotency source of truth
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  stripe_event_id text PRIMARY KEY,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received','processing','processed','failed','replayed','dead_lettered')),
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  correlation_id text,
  dead_letter_reason text,
  dead_lettered_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stripe_webhook_events_status_idx ON public.stripe_webhook_events(status, received_at DESC);
CREATE INDEX IF NOT EXISTS stripe_webhook_events_type_idx ON public.stripe_webhook_events(event_type, received_at DESC);

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read stripe_webhook_events"
  ON public.stripe_webhook_events FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- 3) export_job_telemetry: per-phase timing & memory
CREATE TABLE IF NOT EXISTS public.export_job_telemetry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  phase text NOT NULL,
  duration_ms int,
  memory_mb numeric,
  error_code text,
  correlation_id text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS export_job_telemetry_job_idx ON public.export_job_telemetry(job_id, created_at);
CREATE INDEX IF NOT EXISTS export_job_telemetry_phase_idx ON public.export_job_telemetry(phase, created_at DESC);

ALTER TABLE public.export_job_telemetry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read export_job_telemetry"
  ON public.export_job_telemetry FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "owners read their export_job_telemetry"
  ON public.export_job_telemetry FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.export_jobs ej
    WHERE ej.id = export_job_telemetry.job_id AND ej.user_id = auth.uid()
  ));

-- 4) chargebacks
CREATE TABLE IF NOT EXISTS public.chargebacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_dispute_id text UNIQUE NOT NULL,
  purchase_id uuid REFERENCES public.book_purchases(id) ON DELETE SET NULL,
  amount_cents int NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'usd',
  reason text,
  status text NOT NULL DEFAULT 'needs_response'
    CHECK (status IN ('warning_needs_response','warning_under_review','warning_closed','needs_response','under_review','won','lost','charge_refunded')),
  evidence_due_by timestamptz,
  correlation_id text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chargebacks_status_idx ON public.chargebacks(status, created_at DESC);
CREATE INDEX IF NOT EXISTS chargebacks_purchase_idx ON public.chargebacks(purchase_id) WHERE purchase_id IS NOT NULL;

ALTER TABLE public.chargebacks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read chargebacks"
  ON public.chargebacks FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER chargebacks_set_updated_at
  BEFORE UPDATE ON public.chargebacks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) fraud_signals (created early so chargebacks emit immediately)
CREATE TABLE IF NOT EXISTS public.fraud_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type text NOT NULL CHECK (subject_type IN ('user','ip','email','device','book','listing')),
  subject_value text NOT NULL,
  signal_type text NOT NULL,
  score int NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'system',
  correlation_id text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fraud_signals_subject_idx ON public.fraud_signals(subject_type, subject_value, created_at DESC);
CREATE INDEX IF NOT EXISTS fraud_signals_type_idx ON public.fraud_signals(signal_type, created_at DESC);

ALTER TABLE public.fraud_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read fraud_signals"
  ON public.fraud_signals FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- 6) alert_thresholds (admin-tunable severity escalation)
CREATE TABLE IF NOT EXISTS public.alert_thresholds (
  key text PRIMARY KEY,
  description text,
  warn_value numeric,
  critical_value numeric,
  window_seconds int NOT NULL DEFAULT 300,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
ALTER TABLE public.alert_thresholds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage alert_thresholds"
  ON public.alert_thresholds FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.alert_thresholds (key, description, warn_value, critical_value, window_seconds) VALUES
  ('webhook.failures', 'Failed Stripe webhook deliveries within window', 3, 5, 300),
  ('export.failure_rate_pct', 'Percentage of export jobs failing within window', 10, 25, 900),
  ('ledger.discrepancies', 'Discrepancies between book_purchases and creator_earnings_ledger', 1, 5, 86400),
  ('chargebacks.rate_24h', 'Chargebacks received in last 24 hours', 1, 3, 86400)
ON CONFLICT (key) DO NOTHING;

-- 7) Correlation IDs on existing operational tables (additive, nullable)
ALTER TABLE public.book_purchases ADD COLUMN IF NOT EXISTS correlation_id text;
ALTER TABLE public.export_jobs ADD COLUMN IF NOT EXISTS correlation_id text;
ALTER TABLE public.export_jobs ADD COLUMN IF NOT EXISTS dead_letter_reason text;
ALTER TABLE public.export_jobs ADD COLUMN IF NOT EXISTS dead_lettered_at timestamptz;

CREATE INDEX IF NOT EXISTS book_purchases_correlation_idx ON public.book_purchases(correlation_id) WHERE correlation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS export_jobs_correlation_idx ON public.export_jobs(correlation_id) WHERE correlation_id IS NOT NULL;
