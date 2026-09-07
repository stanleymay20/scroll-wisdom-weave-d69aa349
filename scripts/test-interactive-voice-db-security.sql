\set ON_ERROR_STOP on

DO $$
DECLARE
  v_rls boolean;
  v_reserve_secdef boolean;
  v_release_secdef boolean;
  v_reserve_config text[];
  v_release_config text[];
BEGIN
  IF to_regclass('public.interactive_voice_usage') IS NULL THEN
    RAISE EXCEPTION 'interactive_voice_usage table is missing';
  END IF;

  SELECT c.relrowsecurity
    INTO v_rls
  FROM pg_class AS c
  WHERE c.oid = 'public.interactive_voice_usage'::regclass;

  IF NOT COALESCE(v_rls, false) THEN
    RAISE EXCEPTION 'interactive_voice_usage must have RLS enabled';
  END IF;

  IF has_table_privilege('anon', 'public.interactive_voice_usage', 'SELECT') THEN
    RAISE EXCEPTION 'anon must not read interactive voice usage';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.interactive_voice_usage', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated users must be able to read their own usage through RLS';
  END IF;

  IF has_table_privilege('authenticated', 'public.interactive_voice_usage', 'INSERT')
     OR has_table_privilege('authenticated', 'public.interactive_voice_usage', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.interactive_voice_usage', 'DELETE')
     OR has_table_privilege('anon', 'public.interactive_voice_usage', 'INSERT')
     OR has_table_privilege('anon', 'public.interactive_voice_usage', 'UPDATE')
     OR has_table_privilege('anon', 'public.interactive_voice_usage', 'DELETE') THEN
    RAISE EXCEPTION 'browser roles must not mutate interactive voice usage';
  END IF;

  IF has_function_privilege(
       'authenticated',
       'public.reserve_interactive_voice_seconds(uuid,text,integer,integer)',
       'EXECUTE'
     ) OR has_function_privilege(
       'anon',
       'public.reserve_interactive_voice_seconds(uuid,text,integer,integer)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'reserve_interactive_voice_seconds must be service-only';
  END IF;

  IF has_function_privilege(
       'authenticated',
       'public.release_interactive_voice_seconds(uuid,text,integer)',
       'EXECUTE'
     ) OR has_function_privilege(
       'anon',
       'public.release_interactive_voice_seconds(uuid,text,integer)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'release_interactive_voice_seconds must be service-only';
  END IF;

  IF NOT has_function_privilege(
       'service_role',
       'public.reserve_interactive_voice_seconds(uuid,text,integer,integer)',
       'EXECUTE'
     ) OR NOT has_function_privilege(
       'service_role',
       'public.release_interactive_voice_seconds(uuid,text,integer)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'service_role must be able to reserve and release voice quota';
  END IF;

  SELECT p.prosecdef, p.proconfig
    INTO v_reserve_secdef, v_reserve_config
  FROM pg_proc AS p
  WHERE p.oid = 'public.reserve_interactive_voice_seconds(uuid,text,integer,integer)'::regprocedure;

  SELECT p.prosecdef, p.proconfig
    INTO v_release_secdef, v_release_config
  FROM pg_proc AS p
  WHERE p.oid = 'public.release_interactive_voice_seconds(uuid,text,integer)'::regprocedure;

  IF NOT COALESCE(v_reserve_secdef, false) OR NOT COALESCE(v_release_secdef, false) THEN
    RAISE EXCEPTION 'voice quota mutation RPCs must be SECURITY DEFINER';
  END IF;

  IF NOT ('search_path=public' = ANY(COALESCE(v_reserve_config, ARRAY[]::text[])))
     OR NOT ('search_path=public' = ANY(COALESCE(v_release_config, ARRAY[]::text[]))) THEN
    RAISE EXCEPTION 'voice quota SECURITY DEFINER RPCs must pin search_path=public';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'interactive_voice_usage'
      AND cmd = 'SELECT'
      AND roles @> ARRAY['authenticated']::name[]
  ) THEN
    RAISE EXCEPTION 'authenticated self-read RLS policy is missing';
  END IF;
END
$$;
