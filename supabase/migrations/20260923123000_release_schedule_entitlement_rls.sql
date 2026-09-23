-- Enforce serialized-release entitlement at the database mutation boundary.
--
-- The original RLS policies proved ownership only. Because clients write these
-- tables directly through PostgREST, hiding the UI from free users is not an
-- authorization control. These RESTRICTIVE policies compose with the existing
-- owner policies so owners may still read their historical schedules, while
-- INSERT/UPDATE/DELETE require an active entitlement whose canonical
-- get_user_entitlements() result allows scheduling.

DROP POLICY IF EXISTS release_schedules_entitled_insert
  ON public.release_schedules;
CREATE POLICY release_schedules_entitled_insert
ON public.release_schedules
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
  owner_user_id = (SELECT auth.uid())
  AND COALESCE(
    (
      public.get_user_entitlements((SELECT auth.uid()))
      ->> 'can_schedule_releases'
    )::boolean,
    false
  )
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
  AND COALESCE(
    (
      public.get_user_entitlements((SELECT auth.uid()))
      ->> 'can_schedule_releases'
    )::boolean,
    false
  )
)
WITH CHECK (
  owner_user_id = (SELECT auth.uid())
  AND COALESCE(
    (
      public.get_user_entitlements((SELECT auth.uid()))
      ->> 'can_schedule_releases'
    )::boolean,
    false
  )
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
  AND COALESCE(
    (
      public.get_user_entitlements((SELECT auth.uid()))
      ->> 'can_schedule_releases'
    )::boolean,
    false
  )
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
  AND COALESCE(
    (
      public.get_user_entitlements((SELECT auth.uid()))
      ->> 'can_schedule_releases'
    )::boolean,
    false
  )
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
  AND COALESCE(
    (
      public.get_user_entitlements((SELECT auth.uid()))
      ->> 'can_schedule_releases'
    )::boolean,
    false
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.release_schedules s
    WHERE s.id = release_schedule_items.schedule_id
      AND s.owner_user_id = (SELECT auth.uid())
  )
  AND COALESCE(
    (
      public.get_user_entitlements((SELECT auth.uid()))
      ->> 'can_schedule_releases'
    )::boolean,
    false
  )
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
  AND COALESCE(
    (
      public.get_user_entitlements((SELECT auth.uid()))
      ->> 'can_schedule_releases'
    )::boolean,
    false
  )
);

COMMENT ON POLICY release_schedules_entitled_insert
  ON public.release_schedules IS
  'Restrictive paid-feature boundary: ownership alone is insufficient to create a release schedule.';
COMMENT ON POLICY release_schedule_items_entitled_insert
  ON public.release_schedule_items IS
  'Restrictive paid-feature boundary: schedule ownership and active can_schedule_releases entitlement are both required.';
