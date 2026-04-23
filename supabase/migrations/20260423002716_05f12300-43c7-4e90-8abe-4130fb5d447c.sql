-- 1) Usage gate events table (observability)
CREATE TABLE IF NOT EXISTS public.usage_gate_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  feature text NOT NULL,
  reason text NOT NULL,
  allowed boolean NOT NULL,
  plan text,
  usage_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_gate_events_user_created
  ON public.usage_gate_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_gate_events_feature_created
  ON public.usage_gate_events (feature, created_at DESC);

ALTER TABLE public.usage_gate_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own gate events"
ON public.usage_gate_events
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins can view all gate events"
ON public.usage_gate_events
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- INSERT/UPDATE/DELETE intentionally not granted: events written via SECURITY DEFINER service role only.

-- 2) Secure admin user metrics function
CREATE OR REPLACE FUNCTION public.get_admin_user_metrics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_admin boolean;
  _total int;
  _active_subs int;
  _free int;
  _trial int;
  _active_7d int;
  _active_30d int;
BEGIN
  SELECT public.has_role(auth.uid(), 'admin') INTO _is_admin;
  IF NOT _is_admin THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  SELECT count(*) INTO _total FROM auth.users;

  SELECT count(DISTINCT user_id) INTO _active_subs
  FROM public.subscriptions
  WHERE status = 'active'
    AND (current_period_end IS NULL OR current_period_end > now());

  SELECT count(DISTINCT user_id) INTO _trial
  FROM public.subscriptions
  WHERE status = 'trialing';

  _free := GREATEST(_total - _active_subs - _trial, 0);

  SELECT count(*) INTO _active_7d
  FROM auth.users
  WHERE last_sign_in_at >= now() - interval '7 days';

  SELECT count(*) INTO _active_30d
  FROM auth.users
  WHERE last_sign_in_at >= now() - interval '30 days';

  RETURN jsonb_build_object(
    'total_users', _total,
    'active_subscribers', _active_subs,
    'free_users', _free,
    'trial_users', _trial,
    'active_7d', _active_7d,
    'active_30d', _active_30d,
    'generated_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_user_metrics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_user_metrics() TO authenticated;

-- 3) Per-user usage snapshot (books + tts) — used by usage panel and server gates
CREATE OR REPLACE FUNCTION public.get_user_usage_snapshot(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _is_admin boolean;
  _current_month text := to_char(now(), 'YYYY-MM');
  _books_this_month int := 0;
  _last_book_date date;
  _tts_minutes numeric := 0;
  _plan text := 'free';
BEGIN
  SELECT public.has_role(_caller, 'admin') INTO _is_admin;
  IF _caller IS NULL OR (_caller <> _user_id AND NOT _is_admin) THEN
    RAISE EXCEPTION 'not_authorised';
  END IF;

  SELECT plan, last_book_date,
         CASE WHEN to_char(last_book_date,'YYYY-MM') = _current_month
              THEN coalesce(daily_book_count,0) ELSE 0 END
    INTO _plan, _last_book_date, _books_this_month
  FROM public.profiles
  WHERE user_id = _user_id
  LIMIT 1;

  SELECT coalesce(minutes_used,0) INTO _tts_minutes
  FROM public.tts_usage
  WHERE user_id = _user_id AND month = _current_month
  LIMIT 1;

  RETURN jsonb_build_object(
    'plan', coalesce(_plan,'free'),
    'month', _current_month,
    'books_this_month', _books_this_month,
    'last_book_date', _last_book_date,
    'tts_minutes_used', _tts_minutes,
    'generated_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_usage_snapshot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_usage_snapshot(uuid) TO authenticated;