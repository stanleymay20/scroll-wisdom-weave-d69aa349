
REVOKE EXECUTE ON FUNCTION public.collection_visible_to(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.collection_owned_by(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.collection_visible_to(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.collection_owned_by(uuid, uuid) TO authenticated, service_role;
