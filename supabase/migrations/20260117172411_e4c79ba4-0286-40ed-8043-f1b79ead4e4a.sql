-- Fix 1: Remove overly permissive INSERT policy on contact_submissions
-- The public INSERT is correct but we need to ensure SELECT is restricted
-- Drop duplicate/redundant SELECT policies first
DROP POLICY IF EXISTS "Admins can view all contact submissions" ON public.contact_submissions;
DROP POLICY IF EXISTS "Only admins and moderators can view contact submissions" ON public.contact_submissions;
DROP POLICY IF EXISTS "Users can view their own contact submissions" ON public.contact_submissions;
DROP POLICY IF EXISTS "Users can view their own submissions" ON public.contact_submissions;

-- Create clean SELECT policies - only admins/moderators and the submitter can view
CREATE POLICY "Admins and moderators can view all contact submissions"
ON public.contact_submissions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role IN ('admin', 'moderator')
  )
);

CREATE POLICY "Submitters can view their own submissions"
ON public.contact_submissions
FOR SELECT
USING (user_id = auth.uid());

-- Fix 2: Drop the overly permissive INSERT policy on assessment_integrity_logs
-- Service role operations don't need RLS policies (they bypass RLS)
DROP POLICY IF EXISTS "Service can insert integrity logs" ON public.assessment_integrity_logs;

-- Create a proper INSERT policy that requires authentication
CREATE POLICY "System can insert integrity logs for authenticated users"
ON public.assessment_integrity_logs
FOR INSERT
WITH CHECK (auth.uid() = user_id);