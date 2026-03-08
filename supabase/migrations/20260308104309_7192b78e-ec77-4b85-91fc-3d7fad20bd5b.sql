CREATE TABLE public.ai_usage_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  feature text NOT NULL,
  credits_used numeric NOT NULL DEFAULT 1,
  model_used text,
  metadata jsonb DEFAULT '{}'::jsonb,
  month text NOT NULL DEFAULT to_char(now(), 'YYYY-MM'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_usage_user_month ON public.ai_usage_tracking(user_id, month, feature);

ALTER TABLE public.ai_usage_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own usage" ON public.ai_usage_tracking
  FOR SELECT USING (auth.uid() = user_id);