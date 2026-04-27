-- Phase 11: Backend Security Hardening
-- Address findings from the security scan that map to real issues.

-- ---------------------------------------------------------------------------
-- 1. Tighten public-bucket SELECT policies.
--    Previous policies effectively allowed anyone with a non-null folder name
--    to list / read objects ("OR (storage.foldername(name))[1] IS NOT NULL").
--    Both buckets ARE intentionally public, so collapse to the canonical
--    "bucket_id = '...'" rule so the linter and reviewers see the intent.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Book images are publicly readable by name" ON storage.objects;
DROP POLICY IF EXISTS "Study music readable by name" ON storage.objects;

CREATE POLICY "Book images are publicly readable"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'book-images');

CREATE POLICY "Study music is publicly readable"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'study-music');

-- ---------------------------------------------------------------------------
-- 2. Restrict SECURITY DEFINER functions that should NOT be invokable by
--    unauthenticated (anon) callers via PostgREST.
--    Functions that are *only* used internally by triggers or by RLS context
--    have EXECUTE revoked from PUBLIC and granted only where needed.
-- ---------------------------------------------------------------------------

-- Trigger-only functions: nobody should call these directly.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_organization() FROM PUBLIC, anon, authenticated;

-- Audit / integrity log writers: only authenticated users may call.
REVOKE ALL ON FUNCTION public.log_audit_event(text, uuid, uuid, text, text, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_audit_event(text, uuid, uuid, text, text, text, jsonb)
  TO authenticated;

REVOKE ALL ON FUNCTION public.insert_integrity_log(uuid, uuid, uuid, text, numeric, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.insert_integrity_log(uuid, uuid, uuid, text, numeric, jsonb)
  TO authenticated;

-- Admin metrics / usage snapshots: authenticated only (functions enforce
-- their own admin / self checks internally).
REVOKE ALL ON FUNCTION public.get_admin_user_metrics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_user_metrics() TO authenticated;

REVOKE ALL ON FUNCTION public.get_user_usage_snapshot(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_usage_snapshot(uuid) TO authenticated;

-- has_role / is_org_member / is_org_admin must stay callable by authenticated
-- (they're invoked from RLS policies on behalf of signed-in users).
-- Revoke only from anon since anonymous traffic should never need them.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_org_admin(uuid, uuid) FROM anon;
