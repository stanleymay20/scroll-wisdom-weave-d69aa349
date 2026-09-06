-- Make TTS quota enforcement atomic and server-owned.
--
-- The text-to-speech Edge Function reserves estimated minutes before calling the
-- paid provider. A per-user/month advisory lock prevents concurrent requests
-- from both passing a stale usage check. Failed provider calls can release the
-- reservation. Browser roles cannot invoke either function directly.

CREATE OR REPLACE FUNCTION public.reserve_tts_minutes(
  _user_id uuid,
  _month text,
  _minutes integer,
  _limit integer
)
RETURNS TABLE (
  allowed boolean,
  minutes_used integer,
  remaining_minutes integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current integer := 0;
  v_next integer;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user_id_required';
  END IF;
  IF _month IS NULL OR _month !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'invalid_month';
  END IF;
  IF _minutes IS NULL OR _minutes <= 0 THEN
    RAISE EXCEPTION 'invalid_minutes';
  END IF;
  IF _limit IS NULL OR _limit = 0 OR _limit < -1 THEN
    RAISE EXCEPTION 'invalid_limit';
  END IF;

  -- Works even when no usage row exists yet, unlike a row lock alone.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(_user_id::text || ':' || _month, 0)
  );

  SELECT COALESCE(t.minutes_used, 0)
    INTO v_current
  FROM public.tts_usage AS t
  WHERE t.user_id = _user_id
    AND t.month = _month;

  v_current := COALESCE(v_current, 0);

  IF _limit >= 0 AND v_current + _minutes > _limit THEN
    RETURN QUERY
      SELECT false, v_current, GREATEST(_limit - v_current, 0);
    RETURN;
  END IF;

  v_next := v_current + _minutes;

  INSERT INTO public.tts_usage (user_id, month, minutes_used, updated_at)
  VALUES (_user_id, _month, v_next, now())
  ON CONFLICT (user_id, month)
  DO UPDATE SET
    minutes_used = EXCLUDED.minutes_used,
    updated_at = now();

  RETURN QUERY
    SELECT true, v_next,
      CASE WHEN _limit < 0 THEN -1 ELSE GREATEST(_limit - v_next, 0) END;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_tts_minutes(
  _user_id uuid,
  _month text,
  _minutes integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining integer := 0;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user_id_required';
  END IF;
  IF _month IS NULL OR _month !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'invalid_month';
  END IF;
  IF _minutes IS NULL OR _minutes <= 0 THEN
    RAISE EXCEPTION 'invalid_minutes';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(_user_id::text || ':' || _month, 0)
  );

  UPDATE public.tts_usage
  SET minutes_used = GREATEST(COALESCE(minutes_used, 0) - _minutes, 0),
      updated_at = now()
  WHERE user_id = _user_id
    AND month = _month
  RETURNING minutes_used INTO v_remaining;

  RETURN COALESCE(v_remaining, 0);
END;
$$;

COMMENT ON FUNCTION public.reserve_tts_minutes(uuid, text, integer, integer) IS
  'Server-only atomic TTS quota reservation. Uses a per-user/month advisory lock to prevent concurrent quota overshoot.';
COMMENT ON FUNCTION public.release_tts_minutes(uuid, text, integer) IS
  'Server-only refund of a prior TTS quota reservation when provider generation fails.';

REVOKE ALL ON FUNCTION public.reserve_tts_minutes(uuid, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_tts_minutes(uuid, text, integer)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reserve_tts_minutes(uuid, text, integer, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.release_tts_minutes(uuid, text, integer)
  TO service_role;
