-- Make book-generation quota enforcement atomic and server-owned.
--
-- Mirrors the TTS reservation contract established in
-- 20260906184500_atomic_tts_quota_reservations.sql.
--
-- Before this migration, generate-book read profiles.daily_book_count, ran the
-- full paid generation, then wrote back an absolute value computed from that
-- stale read. Concurrent requests all observed the same count and all wrote the
-- same increment, so N simultaneous generations advanced the counter by one and
-- the paid tier boundary could be crossed at will. The counter was also written
-- only on the success path, so any early return skipped metering entirely.
--
-- The Edge Function now reserves its generation slot BEFORE calling the paid
-- model, and releases the reservation when generation fails. A per-user/day
-- advisory lock prevents concurrent requests from both passing a stale check.
-- Browser roles cannot invoke either function directly.
--
-- profiles.daily_book_count / profiles.last_book_date remain the single source
-- of truth: the frontend (SubscriptionContext, useUsageSnapshot) and
-- get_usage_snapshot() read them, so the reservation writes through to the same
-- columns rather than forking a parallel usage table. Day rollover is resolved
-- inside the lock instead of by the caller.
--
-- Both profile lineages are supported (legacy `id = auth uid` and the current
-- `user_id = auth uid` with a surrogate `id`), matching the identity handling in
-- 20260906194500_harden_profile_authority.sql. These functions are SECURITY
-- DEFINER and execute with auth.uid() IS NULL under service_role, so
-- enforce_profile_authority_fields() passes the server-owned counter writes
-- through unchanged.

CREATE OR REPLACE FUNCTION public.reserve_book_generation(
  _user_id uuid,
  _day date,
  _books integer,
  _limit integer
)
RETURNS TABLE (
  allowed boolean,
  books_used integer,
  remaining_books integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
  v_current integer := 0;
  v_next integer;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user_id_required';
  END IF;
  IF _day IS NULL THEN
    RAISE EXCEPTION 'invalid_day';
  END IF;
  IF _books IS NULL OR _books <= 0 THEN
    RAISE EXCEPTION 'invalid_books';
  END IF;
  -- _limit = -1 means unlimited (usage still tracked). 0 is rejected because a
  -- zero allowance should be expressed as a plan gate, not a quota reservation.
  IF _limit IS NULL OR _limit = 0 OR _limit < -1 THEN
    RAISE EXCEPTION 'invalid_limit';
  END IF;

  -- Serialize this user's day before reading. A row lock alone is insufficient:
  -- the profile row may be absent, and the rollover reset below is a read-then-
  -- write that must not interleave.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(_user_id::text || ':books:' || _day::text, 0)
  );

  -- Prefer the current-lineage match when a schema carries both identities.
  SELECT p.id,
         CASE
           WHEN p.last_book_date = _day THEN COALESCE(p.daily_book_count, 0)
           ELSE 0
         END
    INTO v_profile_id, v_current
  FROM public.profiles AS p
  WHERE p.user_id = _user_id OR p.id = _user_id
  ORDER BY (p.user_id = _user_id) DESC
  LIMIT 1;

  -- Fail closed. A missing profile must not become an unmetered generation.
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  v_current := COALESCE(v_current, 0);

  IF _limit >= 0 AND v_current + _books > _limit THEN
    RETURN QUERY
      SELECT false, v_current, GREATEST(_limit - v_current, 0);
    RETURN;
  END IF;

  v_next := v_current + _books;

  UPDATE public.profiles
  SET daily_book_count = v_next,
      last_book_date = _day
  WHERE id = v_profile_id;

  RETURN QUERY
    SELECT true, v_next,
      CASE WHEN _limit < 0 THEN -1 ELSE GREATEST(_limit - v_next, 0) END;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_book_generation(
  _user_id uuid,
  _day date,
  _books integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
  v_remaining integer := 0;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user_id_required';
  END IF;
  IF _day IS NULL THEN
    RAISE EXCEPTION 'invalid_day';
  END IF;
  IF _books IS NULL OR _books <= 0 THEN
    RAISE EXCEPTION 'invalid_books';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(_user_id::text || ':books:' || _day::text, 0)
  );

  SELECT p.id
    INTO v_profile_id
  FROM public.profiles AS p
  WHERE p.user_id = _user_id OR p.id = _user_id
  ORDER BY (p.user_id = _user_id) DESC
  LIMIT 1;

  IF v_profile_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Only refund against the day the reservation was taken on. A rollover in the
  -- gap between reserve and release must not decrement the new day's counter.
  UPDATE public.profiles
  SET daily_book_count = GREATEST(COALESCE(daily_book_count, 0) - _books, 0)
  WHERE id = v_profile_id
    AND last_book_date = _day
  RETURNING daily_book_count INTO v_remaining;

  RETURN COALESCE(v_remaining, 0);
END;
$$;

COMMENT ON FUNCTION public.reserve_book_generation(uuid, date, integer, integer) IS
  'Server-only atomic book-generation quota reservation. Uses a per-user/day advisory lock to prevent concurrent quota overshoot. Resolves day rollover inside the lock. Pass _limit = -1 for unlimited with usage still tracked.';
COMMENT ON FUNCTION public.release_book_generation(uuid, date, integer) IS
  'Server-only refund of a prior book-generation reservation when generation fails. No-op once the reserved day has rolled over.';

REVOKE ALL ON FUNCTION public.reserve_book_generation(uuid, date, integer, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_book_generation(uuid, date, integer)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reserve_book_generation(uuid, date, integer, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.release_book_generation(uuid, date, integer)
  TO service_role;
