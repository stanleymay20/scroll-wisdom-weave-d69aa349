-- Fix security: Restrict contact_submissions reads to admin/moderator only
-- Drop existing policy that might allow reads
DROP POLICY IF EXISTS "Users can view own submissions" ON public.contact_submissions;
DROP POLICY IF EXISTS "Admin view all submissions" ON public.contact_submissions;

-- Create secure read policy - only admins and moderators can view
CREATE POLICY "Only admins and moderators can view contact submissions"
  ON public.contact_submissions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('admin', 'moderator')
    )
  );

-- Also allow users to view their own submissions if they have a user_id
CREATE POLICY "Users can view their own contact submissions"
  ON public.contact_submissions
  FOR SELECT
  USING (user_id = auth.uid());