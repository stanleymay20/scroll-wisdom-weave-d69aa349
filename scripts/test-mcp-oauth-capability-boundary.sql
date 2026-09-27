-- MCP OAuth capability boundary contract.
--
-- An OAuth/MCP access token contains client_id. It must be usable only through
-- the curated Edge capability surface, never as a generic Data API / Storage /
-- Realtime bearer.

BEGIN;
SET LOCAL client_min_messages TO NOTICE;

DO $$
DECLARE
  v_role_config text[];
  v_missing integer;
BEGIN
  SELECT rolconfig
  INTO v_role_config
  FROM pg_catalog.pg_roles
  WHERE rolname = 'authenticator';

  IF NOT (
    'pgrst.db_pre_request=public.enforce_external_oauth_data_api_boundary'
    = ANY(COALESCE(v_role_config, ARRAY[]::text[]))
  ) THEN
    RAISE EXCEPTION 'PostgREST OAuth capability pre-request guard is not configured';
  END IF;

  -- OAuth client bearer must fail closed.
  PERFORM pg_catalog.set_config(
    'request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated","client_id":"mcp-test-client"}',
    true
  );

  BEGIN
    PERFORM public.enforce_external_oauth_data_api_boundary();
    RAISE EXCEPTION 'OAuth client bearer unexpectedly passed Data API boundary';
  EXCEPTION
    WHEN SQLSTATE 'PGRST' THEN
      NULL;
  END;

  IF public.is_first_party_session() IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'OAuth client bearer is not classified as external';
  END IF;

  -- Ordinary first-party session remains valid.
  PERFORM pg_catalog.set_config(
    'request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',
    true
  );

  PERFORM public.enforce_external_oauth_data_api_boundary();

  IF public.is_first_party_session() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'First-party session was incorrectly classified as external OAuth';
  END IF;

  -- Every current RLS-protected public table must carry the restrictive OAuth
  -- policy. This also makes future unguarded RLS tables fail this CI assertion.
  SELECT count(*)
  INTO v_missing
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p')
    AND c.relrowsecurity
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policies p
      WHERE p.schemaname = n.nspname
        AND p.tablename = c.relname
        AND p.policyname = 'external_oauth_direct_access_block'
        AND p.permissive = 'RESTRICTIVE'
    );

  IF v_missing <> 0 THEN
    RAISE EXCEPTION '% public RLS table(s) are missing external OAuth restrictive policy', v_missing;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'storage'
      AND c.relname = 'objects'
      AND c.relrowsecurity
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies p
    WHERE p.schemaname = 'storage'
      AND p.tablename = 'objects'
      AND p.policyname = 'external_oauth_direct_access_block'
      AND p.permissive = 'RESTRICTIVE'
  ) THEN
    RAISE EXCEPTION 'storage.objects is missing external OAuth restrictive policy';
  END IF;

  RAISE NOTICE 'ALL MCP OAUTH CAPABILITY BOUNDARY ASSERTIONS PASSED';
END
$$;

ROLLBACK;
