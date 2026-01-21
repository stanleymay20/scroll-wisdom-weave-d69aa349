-- 100/100 FINAL HARDENING

-- 1. Fix profiles policy - separate admin and user policies cleanly
DROP POLICY IF EXISTS "Authenticated users can view own profile" ON public.profiles;

-- Users can only view their own profile
CREATE POLICY "Users can view their own profile only"
ON public.profiles
FOR SELECT
USING (auth.uid() = id);

-- Admins have separate policy
CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
);

-- 2. Fix contact_submissions - the SELECT policies need tightening
-- Drop any overlapping SELECT policies and create clean ones
DROP POLICY IF EXISTS "Owner or admin can view contact submissions" ON public.contact_submissions;
DROP POLICY IF EXISTS "Submitters can view their own submissions" ON public.contact_submissions;
DROP POLICY IF EXISTS "Admins and moderators can view all contact submissions" ON public.contact_submissions;

-- Only the owner can view their submission
CREATE POLICY "Submitters can only view their own submissions"
ON public.contact_submissions
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND user_id = auth.uid()
);

-- Admins/moderators can view all (using user_roles table for consistency)
CREATE POLICY "Staff can view all contact submissions"
ON public.contact_submissions
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'moderator'))
);

-- 3. Allow users to view their own security audit entries (transparency)
CREATE POLICY "Users can view their own audit logs"
ON public.security_audit_log
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND user_id = auth.uid()
);