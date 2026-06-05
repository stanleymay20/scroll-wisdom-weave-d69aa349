
-- 1. oauth_states.metadata (needed by connect-shopify to store shop)
ALTER TABLE public.oauth_states
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. creator_platform_connections lifecycle columns (written by OAuth callbacks + disconnect)
ALTER TABLE public.creator_platform_connections
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS disconnected_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_success_at timestamptz,
  ADD COLUMN IF NOT EXISTS consecutive_failures integer NOT NULL DEFAULT 0;

-- 3. Allow 'shopify' in export_jobs.bundle_type (oneClickPublish enqueues this)
ALTER TABLE public.export_jobs DROP CONSTRAINT IF EXISTS export_jobs_bundle_type_check;
ALTER TABLE public.export_jobs
  ADD CONSTRAINT export_jobs_bundle_type_check
  CHECK (bundle_type = ANY (ARRAY[
    'kdp'::text, 'gumroad'::text, 'shopify'::text,
    'substack'::text, 'patreon'::text, 'etsy'::text
  ]));

-- 4. Surface shop_domain in get_my_platform_connections (client reads it for reconnect)
DROP FUNCTION IF EXISTS public.get_my_platform_connections();
CREATE OR REPLACE FUNCTION public.get_my_platform_connections()
RETURNS TABLE (
  platform text,
  connection_status text,
  external_creator_name text,
  shop_domain text,
  scopes text[],
  connected_at timestamptz,
  last_used_at timestamptz,
  last_error text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT platform, connection_status, external_creator_name, shop_domain, scopes,
         created_at AS connected_at, last_used_at, last_error
  FROM public.creator_platform_connections
  WHERE user_id = auth.uid()
$$;

REVOKE ALL ON FUNCTION public.get_my_platform_connections() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_platform_connections() TO authenticated;
