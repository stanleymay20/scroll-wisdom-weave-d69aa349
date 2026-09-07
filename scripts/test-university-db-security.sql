\set ON_ERROR_STOP on

-- Runtime authorization contract for the fully migrated local Supabase database.
-- This complements the fast source-level provisioning security contract by
-- interrogating PostgreSQL's effective RLS and privilege state.

DO $$
DECLARE
  missing_rls text;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname)
    INTO missing_rls
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p')
    AND c.relname LIKE 'university\_%' ESCAPE '\'
    AND NOT c.relrowsecurity;

  IF missing_rls IS NOT NULL THEN
    RAISE EXCEPTION 'ScrollUniversity tables without RLS: %', missing_rls;
  END IF;
END
$$;

DO $$
DECLARE
  table_name text;
  privilege_name text;
BEGIN
  FOR table_name IN
    SELECT c.relname
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relname LIKE 'university\_%' ESCAPE '\'
    ORDER BY c.relname
  LOOP
    FOREACH privilege_name IN ARRAY ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']
    LOOP
      IF pg_catalog.has_table_privilege(
        'anon',
        pg_catalog.format('public.%I', table_name),
        privilege_name
      ) THEN
        RAISE EXCEPTION 'anon unexpectedly has % on public.%', privilege_name, table_name;
      END IF;
    END LOOP;
  END LOOP;
END
$$;

DO $$
DECLARE
  roster_rpc text := 'public.provision_university_roster_batch(uuid,uuid,jsonb)';
  resolver_rpc text := 'public.resolve_university_auth_users(text[])';
BEGIN
  IF pg_catalog.has_function_privilege('anon', roster_rpc, 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', roster_rpc, 'EXECUTE') THEN
    RAISE EXCEPTION 'University roster provisioning RPC is executable outside service_role';
  END IF;

  IF NOT pg_catalog.has_function_privilege('service_role', roster_rpc, 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role cannot execute University roster provisioning RPC';
  END IF;

  IF pg_catalog.has_function_privilege('anon', resolver_rpc, 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', resolver_rpc, 'EXECUTE') THEN
    RAISE EXCEPTION 'University Auth resolver RPC is executable outside service_role';
  END IF;

  IF NOT pg_catalog.has_function_privilege('service_role', resolver_rpc, 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role cannot execute University Auth resolver RPC';
  END IF;
END
$$;

DO $$
DECLARE
  unsafe_policy text;
BEGIN
  SELECT string_agg(format('%I.%I', schemaname, tablename), ', ' ORDER BY tablename)
    INTO unsafe_policy
  FROM pg_catalog.pg_policies
  WHERE schemaname = 'public'
    AND tablename IN (
      'university_enrolments',
      'university_submissions',
      'university_grades',
      'university_attendance_records',
      'university_cohort_members'
    )
    AND (
      coalesce(qual, '') ~ '^\s*true\s*$'
      OR coalesce(with_check, '') ~ '^\s*true\s*$'
    );

  IF unsafe_policy IS NOT NULL THEN
    RAISE EXCEPTION 'Sensitive University table has unconditional RLS policy: %', unsafe_policy;
  END IF;
END
$$;

SELECT 'ScrollUniversity runtime database authorization contract passed.' AS result;
