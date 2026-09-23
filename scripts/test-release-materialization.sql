-- Functional test for public.materialize_due_releases().
--
-- Scheduled releases are a paid feature: an author on the right tier queues
-- chapters from Book Publish Settings and expects them to go live. Nothing in
-- this repository scheduled the worker that made that happen, so this asserts
-- both that the replacement works and that it refuses the cases it must.
--
-- Runs inside a transaction that is always rolled back.
BEGIN;

SET LOCAL client_min_messages TO NOTICE;

DO $$
DECLARE
  _entitled uuid := gen_random_uuid();
  _revoked  uuid := gen_random_uuid();
  _book_ok  uuid;
  _book_rev uuid;
  _sched_ok uuid;
  _sched_rev uuid;
  _due_item uuid;
  _future_item uuid;
  _revoked_item uuid;
  _already_item uuid;
  _result jsonb;
  _status text;
BEGIN
  -- When pg_cron is available in the target database, the migration must
  -- actually register the canonical five-minute materializer. The Edge worker
  -- is only a secret-protected operational fallback now.
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM cron.job
      WHERE jobname = 'materialize_due_releases_every_5_min'
        AND schedule = '*/5 * * * *'
        AND command = 'SELECT public.materialize_due_releases();'
        AND active IS TRUE
    ) THEN
      RAISE EXCEPTION 'canonical release materialization cron job is missing or misconfigured';
    END IF;
  END IF;

  -- Two authors: one entitled to schedule releases, one whose tier lapsed.
  INSERT INTO auth.users (id) VALUES (_entitled), (_revoked);

  INSERT INTO public.creator_entitlements (user_id, tier, can_schedule_releases, payment_status)
  VALUES (_entitled, 'creator_pro', true, 'active'),
         (_revoked,  'free', false, 'active');

  INSERT INTO public.books (user_id, title, category) VALUES (_entitled, 'Entitled Book', 'non_fiction') RETURNING id INTO _book_ok;
  INSERT INTO public.books (user_id, title, category) VALUES (_revoked,  'Revoked Book', 'non_fiction')  RETURNING id INTO _book_rev;

  INSERT INTO public.release_schedules (book_id, owner_user_id) VALUES (_book_ok, _entitled)  RETURNING id INTO _sched_ok;
  INSERT INTO public.release_schedules (book_id, owner_user_id) VALUES (_book_rev, _revoked) RETURNING id INTO _sched_rev;

  -- Due, future, owned-by-a-lapsed-author, and one already released.
  INSERT INTO public.release_schedule_items (schedule_id, chapter_number, release_at, status)
  VALUES (_sched_ok, 1, now() - interval '1 hour', 'scheduled') RETURNING id INTO _due_item;
  INSERT INTO public.release_schedule_items (schedule_id, chapter_number, release_at, status)
  VALUES (_sched_ok, 2, now() + interval '1 day', 'scheduled') RETURNING id INTO _future_item;
  INSERT INTO public.release_schedule_items (schedule_id, chapter_number, release_at, status)
  VALUES (_sched_rev, 1, now() - interval '1 hour', 'scheduled') RETURNING id INTO _revoked_item;
  INSERT INTO public.release_schedule_items (schedule_id, chapter_number, release_at, status, released_at)
  VALUES (_sched_ok, 3, now() - interval '2 hours', 'released', now()) RETURNING id INTO _already_item;

  _result := public.materialize_due_releases();
  RAISE NOTICE 'result: %', _result;

  -- A due item belonging to an entitled author is released.
  SELECT status INTO _status FROM public.release_schedule_items WHERE id = _due_item;
  IF _status IS DISTINCT FROM 'released' THEN
    RAISE EXCEPTION 'due item should be released, got %', _status;
  END IF;
  IF (SELECT released_at FROM public.release_schedule_items WHERE id = _due_item) IS NULL THEN
    RAISE EXCEPTION 'released item must carry released_at';
  END IF;

  -- A future item is untouched. Releasing a chapter early is the one mistake
  -- this function must never make.
  SELECT status INTO _status FROM public.release_schedule_items WHERE id = _future_item;
  IF _status IS DISTINCT FROM 'scheduled' THEN
    RAISE EXCEPTION 'future item must stay scheduled, got %', _status;
  END IF;

  -- A lapsed author's item fails with a reason rather than publishing.
  SELECT status INTO _status FROM public.release_schedule_items WHERE id = _revoked_item;
  IF _status IS DISTINCT FROM 'failed' THEN
    RAISE EXCEPTION 'revoked-entitlement item should fail, got %', _status;
  END IF;
  IF (SELECT error_message FROM public.release_schedule_items WHERE id = _revoked_item)
     IS DISTINCT FROM 'entitlement_revoked' THEN
    RAISE EXCEPTION 'revoked item must record why';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.publishing_audit_log
    WHERE user_id = _revoked AND event_type = 'publish_blocked_by_tier'
  ) THEN
    RAISE EXCEPTION 'tier block must be audited';
  END IF;

  -- Counts reflect what happened.
  IF (_result ->> 'released')::int <> 1 THEN
    RAISE EXCEPTION 'expected 1 released, got %', _result ->> 'released';
  END IF;
  IF (_result ->> 'failed')::int <> 1 THEN
    RAISE EXCEPTION 'expected 1 failed, got %', _result ->> 'failed';
  END IF;

  -- Idempotence: a second pass finds nothing left and changes nothing. This is
  -- what makes it safe to run beside the edge function if that is also wired up.
  _result := public.materialize_due_releases();
  IF (_result ->> 'processed')::int <> 0 THEN
    RAISE EXCEPTION 'second pass should find nothing, got %', _result;
  END IF;

  -- An already-released row is never re-released or re-notified.
  SELECT status INTO _status FROM public.release_schedule_items WHERE id = _already_item;
  IF _status IS DISTINCT FROM 'released' THEN
    RAISE EXCEPTION 'already-released item was disturbed: %', _status;
  END IF;

  RAISE NOTICE 'ALL RELEASE MATERIALIZATION ASSERTIONS PASSED';
END
$$;

ROLLBACK;
