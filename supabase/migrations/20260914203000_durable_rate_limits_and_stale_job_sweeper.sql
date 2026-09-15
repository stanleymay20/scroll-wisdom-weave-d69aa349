-- Phase 1: make rate limiting durable, and recover jobs orphaned by an edge
-- instance dying mid-flight.
--
-- Two independent problems, both invisible until they cost money:
--
-- 1. RATE LIMITING WAS PER-INSTANCE AND IN-MEMORY. _shared/http.ts keeps its
--    buckets in a process-local Map, and generate-book used a second in-memory
--    limiter of its own. Supabase Edge Functions scale horizontally and recycle
--    instances, so "5 generations per hour" was enforced per instance per
--    lifetime, not per user. public.rate_limit_log has existed since
--    20260121181644 with the right indexes and service-only RLS, but no function
--    ever referenced it — dead schema. This gives it an atomic consumer.
--
-- 2. NOTHING RECOVERED A STALLED JOB. enqueue-export-bundle hands long work to
--    EdgeRuntime.waitUntil, which is fire-and-forget inside one instance, and
--    generate-book writes status 'generating' before a multi-minute sequence. If
--    the instance is recycled, times out or crashes, the row stays in its
--    in-progress state forever and the user watches a spinner that will never
--    resolve. The only scheduled job in the repository purges velocity buckets.
--
-- Both helpers are SECURITY DEFINER with a pinned search_path, revoked from
-- browser roles, and granted only to service_role. Neither deletes rows:
-- consume_rate_limit reuses one row per identifier/endpoint rather than
-- appending, so the table does not grow per request.

-- ---------------------------------------------------------------------------
-- 1. Durable fixed-window rate limiting
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  _identifier text,
  _endpoint text,
  _limit integer,
  _window_seconds integer
)
RETURNS TABLE (
  allowed boolean,
  request_count integer,
  retry_after_seconds integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_count integer := 0;
  v_window_start timestamptz;
  v_window interval;
  v_expires timestamptz;
BEGIN
  IF _identifier IS NULL OR length(btrim(_identifier)) = 0 THEN
    RAISE EXCEPTION 'identifier_required';
  END IF;
  IF _endpoint IS NULL OR length(btrim(_endpoint)) = 0 THEN
    RAISE EXCEPTION 'endpoint_required';
  END IF;
  IF _limit IS NULL OR _limit <= 0 THEN
    RAISE EXCEPTION 'invalid_limit';
  END IF;
  IF _window_seconds IS NULL OR _window_seconds <= 0 OR _window_seconds > 86400 THEN
    RAISE EXCEPTION 'invalid_window';
  END IF;

  v_window := make_interval(secs => _window_seconds);

  -- Serialize this identifier/endpoint before reading. A row lock alone is not
  -- enough: on the first request of a window there is no row to lock.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(_identifier || ':' || _endpoint, 0)
  );

  SELECT r.id, COALESCE(r.request_count, 0), r.window_start
    INTO v_id, v_count, v_window_start
  FROM public.rate_limit_log AS r
  WHERE r.identifier = _identifier
    AND r.endpoint = _endpoint
  ORDER BY r.window_start DESC
  LIMIT 1;

  -- First ever request for this key.
  IF v_id IS NULL THEN
    INSERT INTO public.rate_limit_log (identifier, endpoint, request_count, window_start)
    VALUES (_identifier, _endpoint, 1, now());
    RETURN QUERY SELECT true, 1, 0;
    RETURN;
  END IF;

  v_expires := v_window_start + v_window;

  -- Window has rolled over: reuse the row rather than appending a new one, so
  -- the table stays bounded by distinct identifier/endpoint pairs.
  IF now() >= v_expires THEN
    UPDATE public.rate_limit_log
    SET request_count = 1,
        window_start = now()
    WHERE id = v_id;
    RETURN QUERY SELECT true, 1, 0;
    RETURN;
  END IF;

  IF v_count >= _limit THEN
    RETURN QUERY
      SELECT false, v_count,
        GREATEST(1, ceil(extract(epoch FROM (v_expires - now())))::integer);
    RETURN;
  END IF;

  UPDATE public.rate_limit_log
  SET request_count = v_count + 1
  WHERE id = v_id;

  RETURN QUERY SELECT true, v_count + 1, 0;
END;
$$;

COMMENT ON FUNCTION public.consume_rate_limit(text, text, integer, integer) IS
  'Server-only durable fixed-window rate limit. Survives edge instance recycling, unlike the in-memory limiter in _shared/http.ts. Uses a per-identifier/endpoint advisory lock so concurrent requests cannot both pass a stale count.';

REVOKE ALL ON FUNCTION public.consume_rate_limit(text, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, text, integer, integer)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Stale job sweeper
-- ---------------------------------------------------------------------------
-- updated_at is maintained by update_updated_at_column() on both tables, so any
-- real progress refreshes it. A job whose updated_at has not moved for the
-- timeout window is not working — it is orphaned.
--
-- Jobs are failed, never deleted, so the user sees a real error and the row
-- stays available for diagnosis. Marking status 'failed' does not trip
-- enforce_generation_job_completion_truth(), which only intervenes on
-- status = 'completed'.

CREATE OR REPLACE FUNCTION public.sweep_stale_jobs(
  _generation_timeout_minutes integer DEFAULT 30,
  _export_timeout_minutes integer DEFAULT 60
)
RETURNS TABLE (
  generation_jobs_failed integer,
  export_jobs_failed integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_generation integer := 0;
  v_export integer := 0;
BEGIN
  IF _generation_timeout_minutes IS NULL OR _generation_timeout_minutes <= 0 THEN
    RAISE EXCEPTION 'invalid_generation_timeout';
  END IF;
  IF _export_timeout_minutes IS NULL OR _export_timeout_minutes <= 0 THEN
    RAISE EXCEPTION 'invalid_export_timeout';
  END IF;

  WITH swept AS (
    UPDATE public.generation_jobs
    SET status = 'failed',
        error_code = 'JOB_TIMEOUT',
        error_message = 'Generation stopped responding and was closed by the stale-job sweeper.',
        completed_at = now()
    WHERE status IN ('pending', 'generating')
      AND updated_at < now() - make_interval(mins => _generation_timeout_minutes)
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_generation FROM swept;

  WITH swept AS (
    UPDATE public.export_jobs
    SET status = 'failed',
        error_code = 'JOB_TIMEOUT',
        error_message = 'Export stopped responding and was closed by the stale-job sweeper.',
        dead_letter_reason = COALESCE(dead_letter_reason, 'stale_job_sweeper'),
        completed_at = now()
    WHERE status IN ('pending', 'running')
      AND updated_at < now() - make_interval(mins => _export_timeout_minutes)
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_export FROM swept;

  RETURN QUERY SELECT v_generation, v_export;
END;
$$;

COMMENT ON FUNCTION public.sweep_stale_jobs(integer, integer) IS
  'Server-only recovery for jobs orphaned by an edge instance dying mid-flight. Fails jobs whose updated_at heartbeat has gone stale so the user sees an error instead of an indefinite spinner. Never deletes rows.';

REVOKE ALL ON FUNCTION public.sweep_stale_jobs(integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_stale_jobs(integer, integer)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Schedule the sweeper
-- ---------------------------------------------------------------------------
-- Guarded so the migration still applies on a database without pg_cron; the
-- function remains callable by an operator or an Edge Function in that case.

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sweep_stale_jobs_every_10_min') THEN
      PERFORM cron.unschedule('sweep_stale_jobs_every_10_min');
    END IF;
    PERFORM cron.schedule(
      'sweep_stale_jobs_every_10_min',
      '*/10 * * * *',
      'SELECT public.sweep_stale_jobs();'
    );
  END IF;
END
$cron$;
