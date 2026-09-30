-- ScrollLibrary MCP OAuth capability boundary.
--
-- Supabase OAuth access tokens are ordinary user tokens and include client_id.
-- The MCP connector is intentionally proposal-only, so those tokens must not
-- become a generic bypass into PostgREST/RPC, Storage, Realtime, or canonical
-- manuscript tables.
--
-- Rules:
--   * Data API / RPC: OAuth client tokens are rejected at PostgREST pre-request.
--   * RLS-backed direct access (Realtime + Storage): external OAuth is denied by
--     restrictive policies.
--   * Server-owned Edge Functions: requireUser() rejects OAuth by default.
--   * ai-publishing-bridge is the sole privileged opt-in and separately blocks
--     accept/reject decisions for OAuth clients.

CREATE OR REPLACE FUNCTION public.is_first_party_session()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT NULLIF(auth.jwt()->>'client_id', '') IS NULL;
$$;

REVOKE ALL ON FUNCTION public.is_first_party_session()
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_first_party_session()
  TO anon, authenticated, service_role;


CREATE OR REPLACE FUNCTION public.enforce_external_oauth_data_api_boundary()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claims jsonb := COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  );
  v_client_id text := NULLIF(v_claims->>'client_id', '');
BEGIN
  IF v_client_id IS NOT NULL THEN
    RAISE sqlstate 'PGRST'
      USING
        message = jsonb_build_object(
          'code', 'oauth_client_direct_api_blocked',
          'message', 'External OAuth clients must use the ScrollLibrary MCP capability surface.'
        )::text,
        detail = jsonb_build_object(
          'status', 403,
          'status_text', 'Forbidden'
        )::text;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_external_oauth_data_api_boundary()
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_external_oauth_data_api_boundary()
  TO anon, authenticated, service_role;

-- PostgREST executes this before every Data API request. This blocks table,
-- view, and RPC access using an OAuth-client bearer while leaving first-party
-- web/mobile sessions unchanged.
ALTER ROLE authenticator
  SET pgrst.db_pre_request = 'public.enforce_external_oauth_data_api_boundary';

NOTIFY pgrst, 'reload config';


-- Realtime evaluates table RLS rather than PostgREST pre-request hooks.
-- Install one restrictive policy on every current RLS-protected public table.
-- Future RLS tables are guarded by the CI contract added with this migration.
DO $$
DECLARE
  r record;
BEGIN
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

  -- Storage uses its own schema and RLS surface.
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
END;
$$;

COMMENT ON FUNCTION public.is_first_party_session() IS
  'True for ordinary ScrollLibrary sessions; false for OAuth-server tokens carrying client_id. Used to keep external MCP/OAuth clients off direct RLS data surfaces.';

COMMENT ON FUNCTION public.enforce_external_oauth_data_api_boundary() IS
  'PostgREST pre-request guard that forces external OAuth clients through the curated ScrollLibrary MCP/Edge capability surface.';
