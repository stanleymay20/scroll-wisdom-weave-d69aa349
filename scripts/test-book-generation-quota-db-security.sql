-- Book-generation quota reservation contract.
--
-- Proves the defect this replaced is actually closed: generate-book previously
-- read profiles.daily_book_count, ran the paid generation, then wrote back an
-- absolute value derived from that stale read, so concurrent requests all
-- observed the same count and all wrote the same increment.
--
-- The load-bearing assertion is RESERVE-WRITES-IMMEDIATELY: once
-- reserve_book_generation() returns allowed = true, the counter is already
-- advanced inside the same locked call. There is no window in which a second
-- request can read a pre-increment value.
--
-- Runs inside a transaction and rolls back, so it leaves no fixture behind.

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_user_a uuid := '00000000-0000-4000-a000-00000000ab01';
  v_user_b uuid := '00000000-0000-4000-a000-00000000ab02';
  v_ghost  uuid := '00000000-0000-4000-a000-0000000000ff';
  v_today  date := DATE '2026-09-14';
  v_tomorrow date := DATE '2026-09-15';

  v_secdef boolean;
  v_config text[];
  v_can_execute boolean;
  v_advisory_locks integer;

  v_allowed boolean;
  v_used integer;
  v_remaining integer;
  v_stored integer;
  v_stored_day date;
  v_released integer;
  v_sqlstate text;
  v_message text;
BEGIN
  -- ── Fixtures ────────────────────────────────────────────
  -- on_auth_user_created creates the matching public.profiles row.
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data)
  VALUES
    (v_user_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'quota-a@example.test', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
    (v_user_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'quota-b@example.test', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = v_user_a) THEN
    RAISE EXCEPTION 'fixture profile for user A was not created';
  END IF;

  -- ── 1. Server-only execution posture ────────────────────
  SELECT p.prosecdef, p.proconfig
    INTO v_secdef, v_config
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'reserve_book_generation';

  IF v_secdef IS NOT TRUE THEN
    RAISE EXCEPTION 'reserve_book_generation must be SECURITY DEFINER';
  END IF;
  IF v_config IS NULL OR NOT (v_config @> ARRAY['search_path=public']) THEN
    RAISE EXCEPTION 'reserve_book_generation must pin search_path';
  END IF;

  FOREACH v_message IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    v_can_execute := has_function_privilege(
      v_message,
      'public.reserve_book_generation(uuid, date, integer, integer)',
      'EXECUTE'
    );
    IF v_can_execute THEN
      RAISE EXCEPTION 'browser role % must not execute reserve_book_generation', v_message;
    END IF;

    v_can_execute := has_function_privilege(
      v_message,
      'public.release_book_generation(uuid, date, integer)',
      'EXECUTE'
    );
    IF v_can_execute THEN
      RAISE EXCEPTION 'browser role % must not execute release_book_generation', v_message;
    END IF;
  END LOOP;

  IF NOT has_function_privilege(
       'service_role',
       'public.reserve_book_generation(uuid, date, integer, integer)',
       'EXECUTE') THEN
    RAISE EXCEPTION 'service_role must execute reserve_book_generation';
  END IF;

  -- ── 2. Reservation writes inside the locked call ────────
  -- This is the assertion that fails against the old deferred-write code.
  SELECT r.allowed, r.books_used, r.remaining_books
    INTO v_allowed, v_used, v_remaining
  FROM public.reserve_book_generation(v_user_a, v_today, 1, 3) AS r;

  IF v_allowed IS NOT TRUE OR v_used <> 1 OR v_remaining <> 2 THEN
    RAISE EXCEPTION 'first reservation returned allowed=%, used=%, remaining=%',
      v_allowed, v_used, v_remaining;
  END IF;

  SELECT daily_book_count, last_book_date
    INTO v_stored, v_stored_day
  FROM public.profiles WHERE user_id = v_user_a;

  IF v_stored <> 1 THEN
    RAISE EXCEPTION 'counter was not advanced by the reservation itself (found %)', v_stored;
  END IF;
  IF v_stored_day <> v_today THEN
    RAISE EXCEPTION 'reservation did not stamp the reserved day (found %)', v_stored_day;
  END IF;

  -- ── 3. The advisory lock is really taken ────────────────
  SELECT count(*) INTO v_advisory_locks
  FROM pg_locks
  WHERE locktype = 'advisory' AND pid = pg_backend_pid();

  IF v_advisory_locks < 1 THEN
    RAISE EXCEPTION 'reservation did not hold a transaction-scoped advisory lock';
  END IF;

  -- ── 4. The limit is enforced, and a denial writes nothing ──
  PERFORM public.reserve_book_generation(v_user_a, v_today, 1, 3);
  PERFORM public.reserve_book_generation(v_user_a, v_today, 1, 3);

  SELECT r.allowed, r.books_used, r.remaining_books
    INTO v_allowed, v_used, v_remaining
  FROM public.reserve_book_generation(v_user_a, v_today, 1, 3) AS r;

  IF v_allowed IS NOT FALSE THEN
    RAISE EXCEPTION 'fourth reservation against a limit of 3 must be denied';
  END IF;
  IF v_used <> 3 OR v_remaining <> 0 THEN
    RAISE EXCEPTION 'denial reported used=%, remaining=%', v_used, v_remaining;
  END IF;

  SELECT daily_book_count INTO v_stored
  FROM public.profiles WHERE user_id = v_user_a;
  IF v_stored <> 3 THEN
    RAISE EXCEPTION 'denied reservation mutated the counter (found %)', v_stored;
  END IF;

  -- A multi-book reservation that would straddle the limit is refused whole.
  SELECT r.allowed INTO v_allowed
  FROM public.reserve_book_generation(v_user_b, v_today, 4, 3) AS r;
  IF v_allowed IS NOT FALSE THEN
    RAISE EXCEPTION 'oversized reservation must not be partially granted';
  END IF;

  -- ── 5. Day rollover resets inside the lock ──────────────
  SELECT r.allowed, r.books_used
    INTO v_allowed, v_used
  FROM public.reserve_book_generation(v_user_a, v_tomorrow, 1, 3) AS r;

  IF v_allowed IS NOT TRUE OR v_used <> 1 THEN
    RAISE EXCEPTION 'rollover did not reset the counter (allowed=%, used=%)', v_allowed, v_used;
  END IF;

  SELECT daily_book_count, last_book_date
    INTO v_stored, v_stored_day
  FROM public.profiles WHERE user_id = v_user_a;
  IF v_stored <> 1 OR v_stored_day <> v_tomorrow THEN
    RAISE EXCEPTION 'rollover stored count=%, day=%', v_stored, v_stored_day;
  END IF;

  -- ── 6. Unlimited still tracks, never blocks ─────────────
  SELECT r.allowed, r.books_used, r.remaining_books
    INTO v_allowed, v_used, v_remaining
  FROM public.reserve_book_generation(v_user_b, v_today, 1, -1) AS r;

  IF v_allowed IS NOT TRUE OR v_used <> 1 OR v_remaining <> -1 THEN
    RAISE EXCEPTION 'unlimited reservation returned allowed=%, used=%, remaining=%',
      v_allowed, v_used, v_remaining;
  END IF;

  -- ── 7. Release refunds, floors at zero, respects rollover ──
  v_released := public.release_book_generation(v_user_b, v_today, 1);
  IF v_released <> 0 THEN
    RAISE EXCEPTION 'release did not return the post-refund count (got %)', v_released;
  END IF;

  -- Refunding more than was reserved must floor rather than go negative.
  PERFORM public.reserve_book_generation(v_user_b, v_today, 1, 5);
  v_released := public.release_book_generation(v_user_b, v_today, 4);
  IF v_released <> 0 THEN
    RAISE EXCEPTION 'release must floor at zero (got %)', v_released;
  END IF;

  -- A refund aimed at an already-rolled-over day must not touch the new day.
  SELECT daily_book_count INTO v_stored
  FROM public.profiles WHERE user_id = v_user_a;
  PERFORM public.release_book_generation(v_user_a, v_today, 1);
  SELECT daily_book_count INTO v_released
  FROM public.profiles WHERE user_id = v_user_a;
  IF v_released <> v_stored THEN
    RAISE EXCEPTION 'stale-day refund decremented the current day (% -> %)', v_stored, v_released;
  END IF;

  -- ── 8. Missing profile fails closed ─────────────────────
  BEGIN
    PERFORM public.reserve_book_generation(v_ghost, v_today, 1, 3);
    RAISE EXCEPTION 'reservation for a missing profile must fail closed';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message <> 'profile_not_found' THEN
      RAISE EXCEPTION 'expected profile_not_found, got %', v_message;
    END IF;
  END;

  -- ── 9. Input validation ─────────────────────────────────
  BEGIN
    PERFORM public.reserve_book_generation(v_user_a, v_today, 0, 3);
    RAISE EXCEPTION 'zero-book reservation must be rejected';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message <> 'invalid_books' THEN
      RAISE EXCEPTION 'expected invalid_books, got %', v_message;
    END IF;
  END;

  BEGIN
    PERFORM public.reserve_book_generation(v_user_a, v_today, 1, 0);
    RAISE EXCEPTION 'zero limit must be rejected';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message <> 'invalid_limit' THEN
      RAISE EXCEPTION 'expected invalid_limit, got %', v_message;
    END IF;
  END;

  BEGIN
    PERFORM public.reserve_book_generation(NULL, v_today, 1, 3);
    RAISE EXCEPTION 'null user must be rejected';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message <> 'user_id_required' THEN
      RAISE EXCEPTION 'expected user_id_required, got %', v_message;
    END IF;
  END;
END
$$;

ROLLBACK;

SELECT 'Book generation quota reservation contract: PASS' AS result;
