-- Server-owned, race-safe interactive voice quota accounting.
--
-- Voice STT/conversation/TTS Edge Functions reserve seconds before paid
-- provider work and refund reservations when provider work fails. Browser roles
-- may read their own monthly usage but cannot mutate it or execute quota RPCs.

CREATE TABLE IF NOT EXISTS public.interactive_voice_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month text NOT NULL CHECK (month ~ '^\d{4}-\d{2}$'),
  seconds_used integer NOT NULL DEFAULT 0 CHECK (seconds_used >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, month)
);

ALTER TABLE public.interactive_voice_usage ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.interactive_voice_usage FROM anon, authenticated;
GRANT SELECT ON TABLE public.interactive_voice_usage TO authenticated;
GRANT ALL ON TABLE public.interactive_voice_usage TO service_role;

DROP POLICY IF EXISTS "Users can view own interactive voice usage"
  ON public.interactive_voice_usage;
CREATE POLICY "Users can view own interactive voice usage"
  ON public.interactive_voice_usage
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE OR REPLACE FUNCTION public.reserve_interactive_voice_seconds(
  _user_id uuid,
  _month text,
  _seconds integer,
  _limit_seconds integer
)
RETURNS TABLE(
  allowed boolean,
  seconds_used integer,
  remaining_seconds integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current integer := 0;
  v_next integer;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'user_id_required'; END IF;
  IF _month IS NULL OR _month !~ '^\d{4}-\d{2}$' THEN RAISE EXCEPTION 'invalid_month'; END IF;
  IF _seconds IS NULL OR _seconds <= 0 THEN RAISE EXCEPTION 'invalid_seconds'; END IF;
  IF _limit_seconds IS NULL OR _limit_seconds = 0 OR _limit_seconds < -1 THEN
    RAISE EXCEPTION 'invalid_limit';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(_user_id::text || ':' || _month || ':interactive_voice', 0)
  );

  SELECT COALESCE(v.seconds_used, 0)
    INTO v_current
  FROM public.interactive_voice_usage AS v
  WHERE v.user_id = _user_id AND v.month = _month;

  v_current := COALESCE(v_current, 0);

  IF _limit_seconds >= 0 AND v_current + _seconds > _limit_seconds THEN
    RETURN QUERY SELECT false, v_current, GREATEST(_limit_seconds - v_current, 0);
    RETURN;
  END IF;

  v_next := v_current + _seconds;

  INSERT INTO public.interactive_voice_usage (user_id, month, seconds_used, updated_at)
  VALUES (_user_id, _month, v_next, now())
  ON CONFLICT (user_id, month)
  DO UPDATE
    SET seconds_used = EXCLUDED.seconds_used,
        updated_at = now();

  RETURN QUERY
    SELECT true,
           v_next,
           CASE
             WHEN _limit_seconds < 0 THEN -1
             ELSE GREATEST(_limit_seconds - v_next, 0)
           END;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_interactive_voice_seconds(
  _user_id uuid,
  _month text,
  _seconds integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining integer := 0;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'user_id_required'; END IF;
  IF _month IS NULL OR _month !~ '^\d{4}-\d{2}$' THEN RAISE EXCEPTION 'invalid_month'; END IF;
  IF _seconds IS NULL OR _seconds <= 0 THEN RAISE EXCEPTION 'invalid_seconds'; END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(_user_id::text || ':' || _month || ':interactive_voice', 0)
  );

  UPDATE public.interactive_voice_usage
  SET seconds_used = GREATEST(COALESCE(seconds_used, 0) - _seconds, 0),
      updated_at = now()
  WHERE user_id = _user_id AND month = _month
  RETURNING seconds_used INTO v_remaining;

  RETURN COALESCE(v_remaining, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_interactive_voice_seconds(uuid, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_interactive_voice_seconds(uuid, text, integer)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reserve_interactive_voice_seconds(uuid, text, integer, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.release_interactive_voice_seconds(uuid, text, integer)
  TO service_role;

COMMENT ON TABLE public.interactive_voice_usage IS
  'Server-owned per-user/month interactive voice seconds ledger.';
COMMENT ON FUNCTION public.reserve_interactive_voice_seconds(uuid, text, integer, integer) IS
  'Service-only atomic interactive voice quota reservation. Serializes per user/month and refuses quota overshoot.';
COMMENT ON FUNCTION public.release_interactive_voice_seconds(uuid, text, integer) IS
  'Service-only refund for interactive voice seconds reserved before a failed provider operation.';
