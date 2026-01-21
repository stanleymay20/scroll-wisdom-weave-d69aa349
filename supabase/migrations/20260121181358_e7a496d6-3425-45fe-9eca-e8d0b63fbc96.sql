-- IVY LEAGUE SECURITY HARDENING MIGRATION (v3)
-- Fixes remaining CRITICAL security vulnerabilities

-- ================================================
-- 1. PROFILES - Ensure only authenticated users can access their own
-- ================================================
-- Check existing SELECT policy and strengthen if needed
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

CREATE POLICY "Authenticated users can view own profile"
ON public.profiles
FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND (
    id = auth.uid()
    OR
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  )
);

-- ================================================
-- 2. CONTACT SUBMISSIONS - Restrict SELECT to owner + admin only
-- ================================================
DROP POLICY IF EXISTS "Users can view own contact submissions" ON public.contact_submissions;
DROP POLICY IF EXISTS "Admins can view all contact submissions" ON public.contact_submissions;

CREATE POLICY "Owner or admin can view contact submissions"
ON public.contact_submissions
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND (
    user_id = auth.uid()
    OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
  )
);

-- ================================================
-- 3. ASSESSMENT INTEGRITY LOGS - Require authentication for SELECT
-- ================================================
DROP POLICY IF EXISTS "Users can view own integrity logs" ON public.assessment_integrity_logs;

CREATE POLICY "Authenticated users can view own integrity logs"
ON public.assessment_integrity_logs
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND user_id = auth.uid()
);

-- Allow admins to view all for audit purposes
CREATE POLICY "Admins can view all integrity logs"
ON public.assessment_integrity_logs
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ================================================
-- 4. PUBLISHING CERTIFICATES - Ensure no public access 
-- ================================================
-- Policy already updated in v2, just verify with this additional check
DROP POLICY IF EXISTS "Public can verify certificates by number" ON public.publishing_certificates;

-- ================================================
-- 5. USER LIBRARY - Add admin access for support
-- ================================================
CREATE POLICY "Admins can view all library entries"
ON public.user_library
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ================================================
-- 6. HIGHLIGHTS - Add admin access for moderation
-- ================================================
CREATE POLICY "Admins can view all highlights"
ON public.highlights
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
);

-- ================================================
-- 7. STUDY NOTES - Add admin access for moderation
-- ================================================
CREATE POLICY "Admins can view all study notes"
ON public.study_notes
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
);