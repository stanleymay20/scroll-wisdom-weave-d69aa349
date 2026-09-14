-- Durable rate limit and stale-job sweeper contract.
--
-- The load-bearing assertions are:
--   * consume_rate_limit COUNTS AND WRITES INSIDE THE LOCKED CALL, so a second
--     caller can never observe a pre-increment count. This is what the
--     in-memory limiter in _shared/http.ts could not provide across instances.
--   * consume_rate_limit REUSES ONE ROW per identifier/endpoint, so the table
--     does not grow per request.
--   * sweep_stale_jobs only touches jobs whose updated_at heartbeat has gone
--     stale, never fresh ones, and never deletes.
--
-- Runs inside a transaction and rolls back, so it leaves no fixture behind.

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_user   uuid := '00000000-0000-4000-b000-0000000000a1';
  v_book   uuid;
  v_fresh  uuid;
  v_stale  uuid;
  v_xfresh uuid;
  v_xstale uuid;

  v_secdef boolean;
  v_config text[];
  v_role   text;
  v_advisory integer;

  v_allowed boolean;
  v_count integer;
  v_retry integer;
  v_rows integer;
  v_gen integer;
  v_exp integer;
  v_status text;
  v_code text;
  v_message text;
  v_category text;
BEGIN
  -- ── 1. Server-only execution posture ────────────────────
  FOREACH v_message IN ARRAY ARRAY['consume_rate_limit', 'sweep_stale_jobs'] LOOP
    SELECT p.prosecdef, p.proconfig
      INTO v_secdef, v_config
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = v_message;

    IF v_secdef IS NOT TRUE THEN
      RAISE EXCEPTION '% must be SECURITY DEFINER', v_message;
    END IF;
    IF v_config IS NULL OR NOT (v_config @> ARRAY['search_path=public']) THEN
      RAISE EXCEPTION '% must pin search_path', v_message;
    END IF;
  END LOOP;

  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_function_privilege(v_role,
         'public.consume_rate_limit(text, text, integer, integer)', 'EXECUTE') THEN
      RAISE EXCEPTION 'browser role % must not execute consume_rate_limit', v_role;
    END IF;
    IF has_function_privilege(v_role,
         'public.sweep_stale_jobs(integer, integer)', 'EXECUTE') THEN
      RAISE EXCEPTION 'browser role % must not execute sweep_stale_jobs', v_role;
    END IF;
  END LOOP;

  IF NOT has_function_privilege('service_role',
       'public.consume_rate_limit(text, text, integer, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role must execute consume_rate_limit';
  END IF;

  -- ── 2. The count is written inside the locked call ──────
  -- Fails against any implementation that checks without writing.
  SELECT r.allowed, r.request_count, r.retry_after_seconds
    INTO v_allowed, v_count, v_retry
  FROM public.consume_rate_limit('user-a', 'generate-book', 3, 3600) AS r;

  IF v_allowed IS NOT TRUE OR v_count <> 1 OR v_retry <> 0 THEN
    RAISE EXCEPTION 'first consume returned allowed=%, count=%, retry=%',
      v_allowed, v_count, v_retry;
  END IF;

  SELECT request_count INTO v_rows
  FROM public.rate_limit_log WHERE identifier = 'user-a' AND endpoint = 'generate-book';
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'count was not persisted by the consume call itself (found %)', v_rows;
  END IF;

  -- ── 3. The advisory lock is really taken ────────────────
  SELECT count(*) INTO v_advisory
  FROM pg_locks WHERE locktype = 'advisory' AND pid = pg_backend_pid();
  IF v_advisory < 1 THEN
    RAISE EXCEPTION 'consume_rate_limit did not hold a transaction-scoped advisory lock';
  END IF;

  -- ── 4. The limit is enforced, and a denial writes nothing ──
  PERFORM public.consume_rate_limit('user-a', 'generate-book', 3, 3600);
  PERFORM public.consume_rate_limit('user-a', 'generate-book', 3, 3600);

  SELECT r.allowed, r.request_count, r.retry_after_seconds
    INTO v_allowed, v_count, v_retry
  FROM public.consume_rate_limit('user-a', 'generate-book', 3, 3600) AS r;

  IF v_allowed IS NOT FALSE THEN
    RAISE EXCEPTION 'fourth request against a limit of 3 must be denied';
  END IF;
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'denial reported count=%, expected 3', v_count;
  END IF;
  IF v_retry <= 0 THEN
    RAISE EXCEPTION 'denial must report a positive retry_after (got %)', v_retry;
  END IF;

  SELECT request_count INTO v_rows
  FROM public.rate_limit_log WHERE identifier = 'user-a' AND endpoint = 'generate-book';
  IF v_rows <> 3 THEN
    RAISE EXCEPTION 'denied request mutated the counter (found %)', v_rows;
  END IF;

  -- ── 5. One row per identifier/endpoint, not one per request ──
  SELECT count(*)::integer INTO v_rows
  FROM public.rate_limit_log WHERE identifier = 'user-a' AND endpoint = 'generate-book';
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'expected exactly 1 row for the key, found %', v_rows;
  END IF;

  -- ── 6. Identifiers and endpoints are isolated ───────────
  SELECT r.allowed INTO v_allowed
  FROM public.consume_rate_limit('user-b', 'generate-book', 3, 3600) AS r;
  IF v_allowed IS NOT TRUE THEN
    RAISE EXCEPTION 'a different identifier must have its own window';
  END IF;

  SELECT r.allowed INTO v_allowed
  FROM public.consume_rate_limit('user-a', 'text-to-speech', 3, 3600) AS r;
  IF v_allowed IS NOT TRUE THEN
    RAISE EXCEPTION 'a different endpoint must have its own window';
  END IF;

  -- ── 7. Window rollover resets, reusing the same row ─────
  UPDATE public.rate_limit_log
  SET window_start = now() - interval '2 hours'
  WHERE identifier = 'user-a' AND endpoint = 'generate-book';

  SELECT r.allowed, r.request_count
    INTO v_allowed, v_count
  FROM public.consume_rate_limit('user-a', 'generate-book', 3, 3600) AS r;

  IF v_allowed IS NOT TRUE OR v_count <> 1 THEN
    RAISE EXCEPTION 'rollover did not reset the window (allowed=%, count=%)', v_allowed, v_count;
  END IF;

  SELECT count(*)::integer INTO v_rows
  FROM public.rate_limit_log WHERE identifier = 'user-a' AND endpoint = 'generate-book';
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'rollover appended a row instead of reusing one (found %)', v_rows;
  END IF;

  -- ── 8. Input validation ─────────────────────────────────
  BEGIN
    PERFORM public.consume_rate_limit('', 'generate-book', 3, 3600);
    RAISE EXCEPTION 'empty identifier must be rejected';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message <> 'identifier_required' THEN
      RAISE EXCEPTION 'expected identifier_required, got %', v_message;
    END IF;
  END;

  BEGIN
    PERFORM public.consume_rate_limit('user-a', 'generate-book', 0, 3600);
    RAISE EXCEPTION 'zero limit must be rejected';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message <> 'invalid_limit' THEN
      RAISE EXCEPTION 'expected invalid_limit, got %', v_message;
    END IF;
  END;

  BEGIN
    PERFORM public.consume_rate_limit('user-a', 'generate-book', 3, 86401);
    RAISE EXCEPTION 'oversized window must be rejected';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message <> 'invalid_window' THEN
      RAISE EXCEPTION 'expected invalid_window, got %', v_message;
    END IF;
  END;

  -- ── 9. Sweeper: stale jobs fail, fresh jobs are untouched ──
  -- public.books requires title and category (an enum). Resolve the category
  -- from pg_enum rather than hard-coding a label, so this fixture survives the
  -- enum gaining or reordering values.
  SELECT e.enumlabel::text
    INTO v_category
  FROM pg_enum e
  JOIN pg_type t ON t.oid = e.enumtypid
  WHERE t.typname = 'book_category'
  ORDER BY e.enumsortorder
  LIMIT 1;

  IF v_category IS NULL THEN
    RAISE EXCEPTION 'book_category enum not found; books fixture cannot be built';
  END IF;

  INSERT INTO public.books (title, category)
  VALUES ('stale-job sweeper fixture', v_category::public.book_category)
  RETURNING id INTO v_book;

  INSERT INTO public.generation_jobs (user_id, book_id, status)
  VALUES (v_user, v_book, 'generating') RETURNING id INTO v_fresh;
  INSERT INTO public.export_jobs (user_id, book_id, bundle_type, status)
  VALUES (v_user, v_book, 'kdp', 'running') RETURNING id INTO v_xfresh;

  -- The heartbeat premise: update_updated_at_column() refreshes updated_at on
  -- every write, so a job making progress keeps its heartbeat current.
  UPDATE public.generation_jobs SET current_chapter = 1 WHERE id = v_fresh;
  IF (SELECT updated_at FROM public.generation_jobs WHERE id = v_fresh)
       < now() - interval '1 minute' THEN
    RAISE EXCEPTION 'updated_at trigger did not refresh the heartbeat on progress';
  END IF;

  -- Stale jobs are inserted with an already-old heartbeat. Both updated_at
  -- triggers are BEFORE UPDATE only, so an explicit value survives the INSERT —
  -- an UPDATE here would be overwritten by the trigger.
  INSERT INTO public.generation_jobs (user_id, book_id, status, updated_at)
  VALUES (v_user, v_book, 'generating', now() - interval '90 minutes')
  RETURNING id INTO v_stale;

  INSERT INTO public.export_jobs (user_id, book_id, bundle_type, status, updated_at)
  VALUES (v_user, v_book, 'kdp', 'running', now() - interval '5 hours')
  RETURNING id INTO v_xstale;

  SELECT s.generation_jobs_failed, s.export_jobs_failed
    INTO v_gen, v_exp
  FROM public.sweep_stale_jobs(30, 60) AS s;

  IF v_gen <> 1 THEN
    RAISE EXCEPTION 'expected 1 stale generation job swept, got %', v_gen;
  END IF;
  IF v_exp <> 1 THEN
    RAISE EXCEPTION 'expected 1 stale export job swept, got %', v_exp;
  END IF;

  SELECT status, error_code INTO v_status, v_code
  FROM public.generation_jobs WHERE id = v_stale;
  IF v_status <> 'failed' OR v_code <> 'JOB_TIMEOUT' THEN
    RAISE EXCEPTION 'stale generation job ended status=%, code=%', v_status, v_code;
  END IF;

  SELECT status INTO v_status FROM public.generation_jobs WHERE id = v_fresh;
  IF v_status <> 'generating' THEN
    RAISE EXCEPTION 'fresh generation job was swept (status=%)', v_status;
  END IF;

  SELECT status INTO v_status FROM public.export_jobs WHERE id = v_xfresh;
  IF v_status <> 'running' THEN
    RAISE EXCEPTION 'fresh export job was swept (status=%)', v_status;
  END IF;

  SELECT dead_letter_reason INTO v_message FROM public.export_jobs WHERE id = v_xstale;
  IF v_message IS DISTINCT FROM 'stale_job_sweeper' THEN
    RAISE EXCEPTION 'stale export job missing dead_letter_reason (got %)', v_message;
  END IF;

  -- ── 10. The sweeper never deletes ───────────────────────
  SELECT count(*)::integer INTO v_rows FROM public.generation_jobs;
  IF v_rows <> 2 THEN
    RAISE EXCEPTION 'sweeper removed generation job rows (found %)', v_rows;
  END IF;
  SELECT count(*)::integer INTO v_rows FROM public.export_jobs;
  IF v_rows <> 2 THEN
    RAISE EXCEPTION 'sweeper removed export job rows (found %)', v_rows;
  END IF;

  -- ── 11. The sweep is idempotent ─────────────────────────
  SELECT s.generation_jobs_failed, s.export_jobs_failed
    INTO v_gen, v_exp
  FROM public.sweep_stale_jobs(30, 60) AS s;
  IF v_gen <> 0 OR v_exp <> 0 THEN
    RAISE EXCEPTION 're-sweeping already-failed jobs did work (gen=%, exp=%)', v_gen, v_exp;
  END IF;

  -- ── 12. Sweeper input validation ────────────────────────
  BEGIN
    PERFORM public.sweep_stale_jobs(0, 60);
    RAISE EXCEPTION 'zero generation timeout must be rejected';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message <> 'invalid_generation_timeout' THEN
      RAISE EXCEPTION 'expected invalid_generation_timeout, got %', v_message;
    END IF;
  END;
END
$$;

ROLLBACK;

SELECT 'Durable rate limit and stale-job sweeper contract: PASS' AS result;
