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
