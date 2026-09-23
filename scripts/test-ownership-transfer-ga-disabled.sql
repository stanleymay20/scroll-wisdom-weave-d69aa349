\set ON_ERROR_STOP on

DO $$
BEGIN
  IF has_table_privilege('anon', 'public.ownership_transfers', 'INSERT')
     OR has_table_privilege('anon', 'public.ownership_transfers', 'UPDATE')
     OR has_table_privilege('anon', 'public.ownership_transfers', 'DELETE') THEN
    RAISE EXCEPTION 'anon can mutate disabled ownership_transfers';
  END IF;

  IF has_table_privilege('authenticated', 'public.ownership_transfers', 'INSERT')
     OR has_table_privilege('authenticated', 'public.ownership_transfers', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.ownership_transfers', 'DELETE') THEN
    RAISE EXCEPTION 'authenticated can mutate disabled ownership_transfers';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.ownership_transfers', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated cannot read permitted ownership transfer history';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.ownership_transfers', 'INSERT,UPDATE,DELETE,SELECT') THEN
    RAISE EXCEPTION 'service_role lost ownership transfer maintenance authority';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ownership_transfers'
      AND policyname IN ('ownership_transfers_insert_owner', 'ownership_transfers_update_party')
  ) THEN
    RAISE EXCEPTION 'legacy browser mutation policy still exists on ownership_transfers';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ownership_transfers'
      AND cmd = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'ownership transfer history has no SELECT RLS policy';
  END IF;
END
$$;
