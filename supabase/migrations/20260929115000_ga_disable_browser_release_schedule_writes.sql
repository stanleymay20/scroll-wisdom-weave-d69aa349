-- GA launch boundary: serialized releases remain operational for already
-- scheduled/service-owned work, but browser users cannot create or mutate new
-- schedules until the hosted due-item lifecycle has been proven.
REVOKE INSERT, UPDATE, DELETE
  ON TABLE public.release_schedules
  FROM PUBLIC, anon, authenticated;

REVOKE INSERT, UPDATE, DELETE
  ON TABLE public.release_schedule_items
  FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.release_schedules TO authenticated;
GRANT SELECT ON TABLE public.release_schedule_items TO authenticated;
GRANT ALL ON TABLE public.release_schedules TO service_role;
GRANT ALL ON TABLE public.release_schedule_items TO service_role;

DO $ga_release_write_assert$
BEGIN
  IF has_table_privilege('authenticated', 'public.release_schedules', 'INSERT')
     OR has_table_privilege('authenticated', 'public.release_schedules', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.release_schedules', 'DELETE')
     OR has_table_privilege('authenticated', 'public.release_schedule_items', 'INSERT')
     OR has_table_privilege('authenticated', 'public.release_schedule_items', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.release_schedule_items', 'DELETE') THEN
    RAISE EXCEPTION 'GA release scheduling boundary failed: browser mutation authority remains';
  END IF;
END
$ga_release_write_assert$;
