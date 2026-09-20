-- Make scheduled releases actually happen.
--
-- release_schedule_items are created from Book Publish Settings, behind the
-- can_schedule_releases entitlement, and something has to flip them from
-- 'scheduled' to 'released' once release_at passes and notify the author's
-- followers. The edge function materialize-release-schedules does that, and
-- its header calls it a "pg_cron worker" — but no migration in this repository
-- ever scheduled it, and nothing in the tree calls it. If it is not wired up
-- by hand in the dashboard, every release an author has scheduled is still
-- sitting at 'scheduled', silently, for a feature they paid for.
--
-- This migration removes the dependency on invisible configuration by doing
-- the work in the database, where the two existing cron jobs already live
-- (purge_velocity_buckets_hourly and sweep_stale_jobs_every_10_min, both of
-- which call SQL functions directly).
--
-- Nothing needed rewriting to make that possible: the edge function was only
-- orchestration around SQL that already existed. get_user_entitlements and
-- notify_followers_on_schedule_release are both SECURITY DEFINER functions in
-- this schema, so the loop below is the same logic with the HTTP hop, the
-- service-role key and the unauthenticated endpoint removed from the path.
--
-- The edge function is left in place and is now idempotent-compatible with
-- this: both only ever move a row out of 'scheduled', so whichever runs first
-- wins and the other skips.

CREATE OR REPLACE FUNCTION public.materialize_due_releases(_limit integer DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _item record;
  _owner uuid;
  _entitlements jsonb;
  _claimed uuid;
  _notified integer;
  _processed integer := 0;
  _released integer := 0;
  _failed integer := 0;
  _notified_total integer := 0;
BEGIN
  FOR _item IN
    SELECT i.id, i.schedule_id
    FROM public.release_schedule_items i
    WHERE i.status = 'scheduled'
      AND i.release_at <= now()
    ORDER BY i.release_at ASC
    LIMIT GREATEST(1, COALESCE(_limit, 200))
  LOOP
    _processed := _processed + 1;

    BEGIN
      -- Resolve the owner. release_schedules.owner_user_id is NOT NULL and is
      -- the authoritative answer; the book's owner is kept as a fallback
      -- because that is the path the edge function used, and an inner join to
      -- books would yield nothing at all if a book row were missing.
      SELECT COALESCE(s.owner_user_id, b.user_id) INTO _owner
      FROM public.release_schedules s
      LEFT JOIN public.books b ON b.id = s.book_id
      WHERE s.id = _item.schedule_id;

      -- An author who has dropped below the tier that allows scheduling does
      -- not get their queue published anyway. Unresolvable ownership is not
      -- treated as revocation: it is a data problem, not an entitlement one,
      -- and failing the item would hide it.
      IF _owner IS NOT NULL THEN
        _entitlements := public.get_user_entitlements(_owner);

        IF COALESCE((_entitlements ->> 'can_schedule_releases')::boolean, false) = false THEN
          UPDATE public.release_schedule_items
          SET status = 'failed', error_message = 'entitlement_revoked'
          WHERE id = _item.id AND status = 'scheduled';

          INSERT INTO public.publishing_audit_log
            (user_id, platform, event_type, severity, message, metadata)
          VALUES (
            -- publishing_audit_log.platform is NOT NULL. The edge function
            -- passed null here, so this insert threw, its catch swallowed the
            -- real reason, and the item was marked failed with a Postgres
            -- constraint error as its error_message instead of
            -- 'entitlement_revoked'. A ScrollLibrary-native release is the
            -- 'platform' channel, the same word release_schedules.channel uses.
            _owner, 'platform', 'publish_blocked_by_tier', 'warning',
            'Scheduled release skipped: owner lost can_schedule_releases',
            jsonb_build_object(
              'release_schedule_item_id', _item.id,
              'current_tier', COALESCE(_entitlements ->> 'tier', 'free'),
              'source', 'materialize_due_releases'
            )
          );

          _failed := _failed + 1;
          CONTINUE;
        END IF;
      END IF;

      -- Claim the row before doing anything visible. The status predicate is
      -- what makes a concurrent run — or the edge function still being wired
      -- up in the dashboard — safe: exactly one caller can move a given item
      -- out of 'scheduled', and the loser sees no row and moves on without
      -- notifying anyone twice.
      UPDATE public.release_schedule_items
      SET status = 'released', released_at = now()
      WHERE id = _item.id AND status = 'scheduled'
      RETURNING id INTO _claimed;

      IF _claimed IS NULL THEN
        CONTINUE;
      END IF;

      _released := _released + 1;
      _notified := public.notify_followers_on_schedule_release(_item.id);
      _notified_total := _notified_total + COALESCE(_notified, 0);

    EXCEPTION WHEN OTHERS THEN
      -- One bad item must not abandon the rest of the queue. The subtransaction
      -- this block opens rolls back only that item's work, so a release that
      -- fails mid-notification does not leave the batch half-applied.
      _failed := _failed + 1;
      UPDATE public.release_schedule_items
      SET status = 'failed', error_message = left(SQLERRM, 500)
      WHERE id = _item.id AND status = 'scheduled';
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', _processed,
    'released', _released,
    'failed', _failed,
    'notified', _notified_total
  );
END;
$$;

COMMENT ON FUNCTION public.materialize_due_releases(integer) IS
  'Releases due release_schedule_items and notifies followers. Scheduled by cron; safe to run concurrently with the materialize-release-schedules edge function.';

-- service_role is the only identity that should call this directly; browsers
-- reach release schedules through RLS on the tables themselves.
REVOKE ALL ON FUNCTION public.materialize_due_releases(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.materialize_due_releases(integer) TO service_role;

-- Schedule it, matching the pattern the other two cron jobs in this repository
-- use. Every five minutes: a release scheduled for 09:00 goes live by 09:05,
-- which is the precision a chapter drop needs, and the query is an index-only
-- scan of idx_release_items_due that finds nothing the rest of the time.
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'materialize_due_releases_every_5_min') THEN
      PERFORM cron.unschedule('materialize_due_releases_every_5_min');
    END IF;
    PERFORM cron.schedule(
      'materialize_due_releases_every_5_min',
      '*/5 * * * *',
      'SELECT public.materialize_due_releases();'
    );
  END IF;
END
$cron$;
