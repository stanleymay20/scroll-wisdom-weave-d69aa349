
-- =====================================================================
-- Phase 2.1d — Financial Reliability + Analytics Expansion
-- =====================================================================

-- ---- refund_requests ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.refund_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL,
  book_id uuid NOT NULL,
  buyer_user_id uuid,
  creator_user_id uuid,
  requested_by uuid,
  requested_role text NOT NULL DEFAULT 'admin',
  status text NOT NULL DEFAULT 'pending',
  reason text,
  amount_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'usd',
  stripe_refund_id text,
  stripe_payment_intent text,
  processed_at timestamptz,
  processed_by uuid,
  correlation_id text,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_refund_requests_purchase ON public.refund_requests(purchase_id);
CREATE INDEX IF NOT EXISTS idx_refund_requests_status ON public.refund_requests(status, created_at DESC);

ALTER TABLE public.refund_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage refund_requests" ON public.refund_requests
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "buyers read own refund_requests" ON public.refund_requests
  FOR SELECT TO authenticated
  USING (buyer_user_id = auth.uid());

CREATE POLICY "creators read refund_requests for their books" ON public.refund_requests
  FOR SELECT TO authenticated
  USING (creator_user_id = auth.uid());

CREATE TRIGGER trg_refund_requests_updated_at
  BEFORE UPDATE ON public.refund_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---- attribution_sessions -------------------------------------------
CREATE TABLE IF NOT EXISTS public.attribution_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  user_id uuid,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  first_touch_source text,
  first_touch_medium text,
  first_touch_campaign text,
  first_touch_referrer text,
  first_touch_landing_path text,
  utm_term text,
  utm_content text,
  ip_hash text,
  country_code text,
  user_agent_family text,
  events_count integer NOT NULL DEFAULT 0,
  converted_purchase_id uuid,
  converted_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT attribution_sessions_session_unique UNIQUE (session_id)
);
CREATE INDEX IF NOT EXISTS idx_attribution_user ON public.attribution_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_attribution_source ON public.attribution_sessions(first_touch_source);
CREATE INDEX IF NOT EXISTS idx_attribution_first_seen ON public.attribution_sessions(first_seen_at DESC);

ALTER TABLE public.attribution_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read attribution_sessions" ON public.attribution_sessions
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "users read own attribution_sessions" ON public.attribution_sessions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ---- cohort_metrics -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cohort_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_date date NOT NULL,
  metric_date date NOT NULL,
  cohort_size integer NOT NULL DEFAULT 0,
  paying_users integer NOT NULL DEFAULT 0,
  active_users integer NOT NULL DEFAULT 0,
  gross_cents bigint NOT NULL DEFAULT 0,
  refund_cents bigint NOT NULL DEFAULT 0,
  net_cents bigint NOT NULL DEFAULT 0,
  visitors integer NOT NULL DEFAULT 0,
  exports_count integer NOT NULL DEFAULT 0,
  rpv_cents numeric(12,4),
  rpe_cents numeric(12,4),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cohort_metrics_unique UNIQUE (cohort_date, metric_date)
);
CREATE INDEX IF NOT EXISTS idx_cohort_metric_date ON public.cohort_metrics(metric_date DESC);

ALTER TABLE public.cohort_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read cohort_metrics" ON public.cohort_metrics
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
