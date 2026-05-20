
-- 1) Attribution: device fingerprint + class (hashed, no raw UA stored).
ALTER TABLE public.attribution_sessions
  ADD COLUMN IF NOT EXISTS user_agent_hash text,
  ADD COLUMN IF NOT EXISTS device_class text;

CREATE INDEX IF NOT EXISTS idx_attribution_user_agent_hash
  ON public.attribution_sessions(user_agent_hash)
  WHERE user_agent_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_attribution_device_class
  ON public.attribution_sessions(device_class)
  WHERE device_class IS NOT NULL;

-- 2) Persistent velocity counter (cross-instance rate limiting).
CREATE TABLE IF NOT EXISTS public.velocity_buckets (
  key text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.velocity_buckets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read velocity_buckets"
  ON public.velocity_buckets FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Service-role-only mutations; no INSERT/UPDATE/DELETE policy for clients.

CREATE INDEX IF NOT EXISTS idx_velocity_updated_at
  ON public.velocity_buckets(updated_at DESC);

CREATE OR REPLACE FUNCTION public.check_velocity(_key text, _limit int, _window_seconds int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _now timestamptz := now();
  _row public.velocity_buckets%ROWTYPE;
BEGIN
  INSERT INTO public.velocity_buckets (key, window_start, count, updated_at)
  VALUES (_key, _now, 1, _now)
  ON CONFLICT (key) DO UPDATE
  SET count = CASE
                WHEN public.velocity_buckets.window_start + make_interval(secs => _window_seconds) < _now
                  THEN 1
                ELSE public.velocity_buckets.count + 1
              END,
      window_start = CASE
                WHEN public.velocity_buckets.window_start + make_interval(secs => _window_seconds) < _now
                  THEN _now
                ELSE public.velocity_buckets.window_start
              END,
      updated_at = _now
  RETURNING * INTO _row;

  IF _row.count > _limit THEN
    RETURN jsonb_build_object(
      'ok', false,
      'count', _row.count,
      'limit', _limit,
      'retry_after', GREATEST(1, _window_seconds - EXTRACT(epoch FROM (_now - _row.window_start))::int)
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'count', _row.count, 'limit', _limit);
END;
$$;

REVOKE ALL ON FUNCTION public.check_velocity(text, int, int) FROM PUBLIC, anon, authenticated;

-- 3) Hot-path indexes (additive, IF NOT EXISTS).
CREATE INDEX IF NOT EXISTS idx_storefront_events_type_created
  ON public.storefront_events(event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_storefront_events_session_created
  ON public.storefront_events(session_id, created_at DESC)
  WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_storefront_events_user_created
  ON public.storefront_events(user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_export_jobs_user_created
  ON public.export_jobs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_export_jobs_status_created
  ON public.export_jobs(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_attribution_first_seen_brin
  ON public.attribution_sessions USING brin(first_seen_at);
