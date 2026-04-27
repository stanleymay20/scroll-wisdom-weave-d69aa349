-- Allow anonymous (unauthenticated) users to submit contact forms
-- The current policy required auth.uid() IS NOT NULL which broke anonymous contact form submissions

DROP POLICY IF EXISTS "Authenticated users can create contact submissions" ON public.contact_submissions;

-- Anonymous users can submit, but user_id MUST be NULL (cannot impersonate someone)
CREATE POLICY "Anonymous can submit contact forms with null user_id"
ON public.contact_submissions
FOR INSERT
TO anon
WITH CHECK (user_id IS NULL);

-- Authenticated users can submit, and if they set a user_id, it must match their own
CREATE POLICY "Authenticated users can submit contact forms"
ON public.contact_submissions
FOR INSERT
TO authenticated
WITH CHECK (user_id IS NULL OR user_id = auth.uid());