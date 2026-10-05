-- Converge the external-OAuth restrictive RLS boundary after later schema changes.
--
-- The original MCP boundary migration (20260927162500) installed the policy on
-- every RLS-protected table that existed at that point. Later migrations can
-- legitimately add RLS tables, so this reconciliation migration reapplies the
-- restrictive policy to the complete current surface. The CI contract
-- scripts/test-mcp-oauth-capability-boundary.sql then fails closed whenever a
-- future RLS table is added without this policy.

DO $$
DECLARE
  r record;
BEGIN
  IF to_regprocedure('public.is_first_party_session()') IS NULL THEN
    RAISE EXCEPTION 'MCP OAuth boundary helper public.is_first_party_session() is missing';
  END IF;

  FOR r IN
    SELECT n.nspname AS schema_name, c.relname AS table_name
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relrowsecurity
  LOOP
    EXECUTE pg_catalog.format(
      'DROP POLICY IF EXISTS external_oauth_direct_access_block ON %I.%I',
      r.schema_name,
      r.table_name
    );

    EXECUTE pg_catalog.format(
      'CREATE POLICY external_oauth_direct_access_block ON %I.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.is_first_party_session())) WITH CHECK ((SELECT public.is_first_party_session()))',
      r.schema_name,
      r.table_name
    );
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'storage'
      AND c.relname = 'objects'
      AND c.relrowsecurity
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS external_oauth_direct_access_block ON storage.objects';
    EXECUTE 'CREATE POLICY external_oauth_direct_access_block ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.is_first_party_session())) WITH CHECK ((SELECT public.is_first_party_session()))';
  END IF;
END
$$;

COMMENT ON FUNCTION public.is_first_party_session() IS
  'True for ordinary ScrollLibrary sessions; false for OAuth-server tokens carrying client_id. Every RLS table must retain the external_oauth_direct_access_block restrictive policy; CI enforces this invariant.';
