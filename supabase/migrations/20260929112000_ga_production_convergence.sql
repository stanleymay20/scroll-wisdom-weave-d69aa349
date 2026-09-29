-- GA production convergence migration.
--
-- ScrollLibrary's hosted production database had been rebuilt from consolidated
-- snapshots that did not carry several later repository migrations. This
-- forward-only migration deliberately replays the idempotent contracts needed
-- for GA so fresh databases and consolidated hosted databases converge.
--
-- Do not remove the original migrations. They remain the historical source of
-- each contract; this migration is the explicit convergence boundary.

-- BEGIN CONVERGENCE COPY: supabase/migrations/20260920180000_schedule_release_materialization.sql
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
-- END CONVERGENCE COPY: supabase/migrations/20260920180000_schedule_release_materialization.sql

-- BEGIN CONVERGENCE COPY: supabase/migrations/20260923123000_release_schedule_entitlement_rls.sql
-- Enforce serialized-release entitlement at the database mutation boundary.
--
-- The original RLS policies proved ownership only. Because clients write these
-- tables directly through PostgREST, hiding the UI from free users is not an
-- authorization control. These RESTRICTIVE policies compose with the existing
-- owner policies so owners may still read their historical schedules, while
-- INSERT/UPDATE/DELETE require an active entitlement whose canonical
-- get_user_entitlements() result allows scheduling.

-- RLS executes as the browser role. The canonical entitlement resolver itself
-- remains service-role-only, so expose only a self-scoped boolean wrapper.
CREATE OR REPLACE FUNCTION public.current_user_can_schedule_releases()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS '
  SELECT COALESCE(
    (
      public.get_user_entitlements((SELECT auth.uid()))
      ->> ''can_schedule_releases''
    )::boolean,
    false
  )
';

REVOKE ALL ON FUNCTION public.current_user_can_schedule_releases()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_can_schedule_releases()
  TO authenticated, service_role;

COMMENT ON FUNCTION public.current_user_can_schedule_releases() IS
  'Self-scoped release-scheduling entitlement check for browser RLS; does not expose another user''s entitlement record.';

-- Table privileges let PostgREST reach the RLS boundary. RLS remains the
-- authorization control: free/lapsed owners can read historical schedules,
-- while the restrictive mutation policies below reject writes.
REVOKE ALL ON TABLE public.release_schedules, public.release_schedule_items
  FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.release_schedules, public.release_schedule_items
  TO authenticated;

DROP POLICY IF EXISTS release_schedules_entitled_insert
  ON public.release_schedules;
CREATE POLICY release_schedules_entitled_insert
ON public.release_schedules
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
  owner_user_id = (SELECT auth.uid())
  AND public.current_user_can_schedule_releases()
);

DROP POLICY IF EXISTS release_schedules_entitled_update
  ON public.release_schedules;
CREATE POLICY release_schedules_entitled_update
ON public.release_schedules
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (
  owner_user_id = (SELECT auth.uid())
  AND public.current_user_can_schedule_releases()
)
WITH CHECK (
  owner_user_id = (SELECT auth.uid())
  AND public.current_user_can_schedule_releases()
);

DROP POLICY IF EXISTS release_schedules_entitled_delete
  ON public.release_schedules;
CREATE POLICY release_schedules_entitled_delete
ON public.release_schedules
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (
  owner_user_id = (SELECT auth.uid())
  AND public.current_user_can_schedule_releases()
);

DROP POLICY IF EXISTS release_schedule_items_entitled_insert
  ON public.release_schedule_items;
CREATE POLICY release_schedule_items_entitled_insert
ON public.release_schedule_items
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.release_schedules s
    WHERE s.id = release_schedule_items.schedule_id
      AND s.owner_user_id = (SELECT auth.uid())
  )
  AND public.current_user_can_schedule_releases()
);

DROP POLICY IF EXISTS release_schedule_items_entitled_update
  ON public.release_schedule_items;
CREATE POLICY release_schedule_items_entitled_update
ON public.release_schedule_items
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.release_schedules s
    WHERE s.id = release_schedule_items.schedule_id
      AND s.owner_user_id = (SELECT auth.uid())
  )
  AND public.current_user_can_schedule_releases()
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.release_schedules s
    WHERE s.id = release_schedule_items.schedule_id
      AND s.owner_user_id = (SELECT auth.uid())
  )
  AND public.current_user_can_schedule_releases()
);

DROP POLICY IF EXISTS release_schedule_items_entitled_delete
  ON public.release_schedule_items;
CREATE POLICY release_schedule_items_entitled_delete
ON public.release_schedule_items
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.release_schedules s
    WHERE s.id = release_schedule_items.schedule_id
      AND s.owner_user_id = (SELECT auth.uid())
  )
  AND public.current_user_can_schedule_releases()
);

COMMENT ON POLICY release_schedules_entitled_insert
  ON public.release_schedules IS
  'Restrictive paid-feature boundary: ownership alone is insufficient to create a release schedule.';
COMMENT ON POLICY release_schedule_items_entitled_insert
  ON public.release_schedule_items IS
  'Restrictive paid-feature boundary: schedule ownership and active can_schedule_releases entitlement are both required.';
-- END CONVERGENCE COPY: supabase/migrations/20260923123000_release_schedule_entitlement_rls.sql

-- BEGIN CONVERGENCE COPY: drizzle/migrations/0001_fix_ai_assistance_level_and_buyer_policies.sql
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS ai_assistance_level text
  CHECK (ai_assistance_level IS NULL OR ai_assistance_level IN ('none','assisted','generated'));

DROP POLICY IF EXISTS "Buyers can read purchased books" ON public.books;
CREATE POLICY "Buyers can read purchased books" ON public.books
  FOR SELECT TO authenticated
  USING (public.user_owns_book_purchase(auth.uid(), id));

DROP POLICY IF EXISTS "Buyers can read full chapters of purchased books" ON public.chapters;
CREATE POLICY "Buyers can read full chapters of purchased books" ON public.chapters
  FOR SELECT TO authenticated
  USING (public.user_owns_book_purchase(auth.uid(), book_id));

GRANT EXECUTE ON FUNCTION public.user_owns_book_purchase(uuid, uuid) TO authenticated, service_role;
-- END CONVERGENCE COPY: drizzle/migrations/0001_fix_ai_assistance_level_and_buyer_policies.sql


-- Re-register the two pre-existing operational jobs that consolidated hosted
-- database snapshots can preserve as functions while losing from cron.job.
DO $ops_cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF to_regprocedure('public.purge_velocity_buckets()') IS NULL THEN
      RAISE EXCEPTION 'GA convergence failed: purge_velocity_buckets() missing';
    END IF;
    IF to_regprocedure('public.sweep_stale_jobs(integer,integer)') IS NULL THEN
      RAISE EXCEPTION 'GA convergence failed: sweep_stale_jobs(integer,integer) missing';
    END IF;

    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge_velocity_buckets_hourly') THEN
      PERFORM cron.unschedule('purge_velocity_buckets_hourly');
    END IF;
    PERFORM cron.schedule(
      'purge_velocity_buckets_hourly',
      '17 * * * *',
      'SELECT public.purge_velocity_buckets();'
    );

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
$ops_cron$;

-- Fail this migration if any GA invariant still failed to materialize.
DO $ga$
BEGIN
  IF to_regprocedure('public.materialize_due_releases(integer)') IS NULL THEN
    RAISE EXCEPTION 'GA convergence failed: materialize_due_releases(integer) missing';
  END IF;
  IF to_regprocedure('public.current_user_can_schedule_releases()') IS NULL THEN
    RAISE EXCEPTION 'GA convergence failed: current_user_can_schedule_releases() missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'books' AND column_name = 'ai_assistance_level'
  ) THEN
    RAISE EXCEPTION 'GA convergence failed: books.ai_assistance_level missing';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND NOT EXISTS (
       SELECT 1 FROM cron.job
       WHERE jobname = 'materialize_due_releases_every_5_min'
         AND schedule = '*/5 * * * *'
         AND command = 'SELECT public.materialize_due_releases();'
         AND active IS TRUE
     ) THEN
    RAISE EXCEPTION 'GA convergence failed: release materialization cron missing or inactive';
  END IF;
  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'release_schedules'
        AND policyname LIKE 'release_schedules_entitled_%') <> 3 THEN
    RAISE EXCEPTION 'GA convergence failed: release_schedules entitlement policy set incomplete';
  END IF;
  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'release_schedule_items'
        AND policyname LIKE 'release_schedule_items_entitled_%') <> 3 THEN
    RAISE EXCEPTION 'GA convergence failed: release_schedule_items entitlement policy set incomplete';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND NOT EXISTS (
       SELECT 1 FROM cron.job
       WHERE jobname = 'purge_velocity_buckets_hourly'
         AND schedule = '17 * * * *'
         AND command = 'SELECT public.purge_velocity_buckets();'
         AND active IS TRUE
     ) THEN
    RAISE EXCEPTION 'GA convergence failed: velocity-bucket cleanup cron missing or inactive';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND NOT EXISTS (
       SELECT 1 FROM cron.job
       WHERE jobname = 'sweep_stale_jobs_every_10_min'
         AND schedule = '*/10 * * * *'
         AND command = 'SELECT public.sweep_stale_jobs();'
         AND active IS TRUE
     ) THEN
    RAISE EXCEPTION 'GA convergence failed: stale-job sweeper cron missing or inactive';
  END IF;
END
$ga$;
