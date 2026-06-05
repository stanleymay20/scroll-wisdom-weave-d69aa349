-- ============================================================================
-- Surface shop_domain in get_my_platform_connections so the in-app
-- Reconnect button can prefill the Shopify shop input instead of forcing
-- creators to retype their store URL after a token expiry.
-- The function signature changes, so we DROP-and-recreate (CREATE OR REPLACE
-- only works when the column list is identical).
-- ============================================================================

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
