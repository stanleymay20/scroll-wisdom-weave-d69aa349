REVOKE EXECUTE ON FUNCTION public.get_recommendation_analytics(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_recommendation_diversity(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_update_discovery_weight(text, numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_recommendation_suppression(uuid, integer) FROM anon;