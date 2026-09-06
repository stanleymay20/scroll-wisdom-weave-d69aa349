-- Server-owned, race-safe TTS quota accounting.
--
-- The text-to-speech Edge Function reserves the estimated minutes before any
-- paid provider call and releases that reservation if generation fails.
-- Browser roles may read their own usage but cannot mutate usage or execute
-- either quota mutation RPC directly.

-- The tts_usage table predates this hardening migration. Keep the migration
-- additive/idempotent while asserting the uniqueness contract required by the
-- atomic upsert below.
DO $$
BEGIN
  IF to_regclass('public.tts_usage') IS NULL THEN
    RAISE EXCEPTION 'tts_usage table is required before atomic quota hardening';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.tts_usage'::regclass
      AND conname = 'tts_usage_user_id_month_key'
  ) THEN
    ALTER TABLE public.tts_usage
      ADD CONSTRAINT tts_usage_user_id_month_key UNIQUE (user_id, month);
  END IF;
END
$$;

ALTER TABLE public.tts_usage ENABLE ROW LEVEL SECURITY;

-- Least privilege: application clients can only read their own current usage.
REVOKE ALL ON TABLE public.tts_usage FROM anon, authenticated;
GRANT SELECT ON TABLE public.tts_usage TO authenticated;
GRANT ALL ON TABLE public.tts_usage TO service_role;

-- Remove historical browser-write policies so a future grant cannot silently
-- reopen quota tampering.
DROP POLICY IF EXISTS "Users can insert their own TTS usage" ON public.tts_usage;
DROP POLICY IF EXISTS "Users can update their own TTS usage" ON public.tts_usage;
DROP POLICY IF EXISTS "Users can view their own TTS usage" ON public.tts_usage;
DROP POLICY IF EXISTS "Users can view own TTS usage" ON public.tts_usage;

CREATE POLICY "Users can view own TTS usage"
  ON public.tts_usage
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE OR REPLACE FUNCTION public.reserve_tts_minutes(
  _user_id uuid,
  _month text,
  _minutes integer,
  _limit integer
)
RETURNS TABLE(
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
  IF _user_id IS NULL THEN RAISE EXCEPTION 'user_id_required'; END IF;
  IF _month IS NULL OR _month !~ '^\d{4}-\d{2}$' THEN RAISE EXCEPTION 'invalid_month'; END IF;
  IF _minutes IS NULL OR _minutes <= 0 THEN RAISE EXCEPTION 'invalid_minutes'; END IF;
  IF _limit IS NULL OR _limit = 0 OR _limit < -1 THEN RAISE EXCEPTION 'invalid_limit'; END IF;

  -- Serialize reservations for the same user/month across Edge Function
  -- instances. This closes parallel-request quota races.
  PERFORM pg_advisory_xact_lock(hashtextextended(_user_id::text || ':' || _month, 0));

  SELECT COALESCE(t.minutes_used, 0)
    INTO v_current
  FROM public.tts_usage AS t
  WHERE t.user_id = _user_id AND t.month = _month;

  v_current := COALESCE(v_current, 0);

  IF _limit >= 0 AND v_current + _minutes > _limit THEN
    RETURN QUERY SELECT false, v_current, GREATEST(_limit - v_current, 0);
    RETURN;
  END IF;

  v_next := v_current + _minutes;

  INSERT INTO public.tts_usage (user_id, month, minutes_used, updated_at)
  VALUES (_user_id, _month, v_next, now())
  ON CONFLICT (user_id, month)
  DO UPDATE
    SET minutes_used = EXCLUDED.minutes_used,
        updated_at = now();

  RETURN QUERY
    SELECT true,
           v_next,
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
  IF _user_id IS NULL THEN RAISE EXCEPTION 'user_id_required'; END IF;
  IF _month IS NULL OR _month !~ '^\d{4}-\d{2}$' THEN RAISE EXCEPTION 'invalid_month'; END IF;
  IF _minutes IS NULL OR _minutes <= 0 THEN RAISE EXCEPTION 'invalid_minutes'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_user_id::text || ':' || _month, 0));

  UPDATE public.tts_usage
  SET minutes_used = GREATEST(COALESCE(minutes_used, 0) - _minutes, 0),
      updated_at = now()
  WHERE user_id = _user_id AND month = _month
  RETURNING minutes_used INTO v_remaining;

  RETURN COALESCE(v_remaining, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_tts_minutes(uuid, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_tts_minutes(uuid, text, integer)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reserve_tts_minutes(uuid, text, integer, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.release_tts_minutes(uuid, text, integer)
  TO service_role;

COMMENT ON FUNCTION public.reserve_tts_minutes(uuid, text, integer, integer) IS
  'Service-only atomic TTS quota reservation. Serializes per user/month and refuses requests that would exceed the configured limit.';
COMMENT ON FUNCTION public.release_tts_minutes(uuid, text, integer) IS
  'Service-only refund for a previously reserved TTS quota amount when the paid provider call fails.';