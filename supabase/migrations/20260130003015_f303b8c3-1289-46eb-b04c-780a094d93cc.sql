-- Fix overly permissive RLS policy on contact_submissions
-- Drop the old permissive policy that allows anonymous inserts
DROP POLICY IF EXISTS "Anyone can create contact submissions" ON public.contact_submissions;

-- Create a new policy that requires authentication
-- Users must be authenticated to create contact submissions
CREATE POLICY "Authenticated users can create contact submissions" 
ON public.contact_submissions 
FOR INSERT 
WITH CHECK (
  -- User must be authenticated (prevents anonymous spam)
  auth.uid() IS NOT NULL
  AND (
    -- If user_id is provided, it must match the authenticated user
    user_id IS NULL 
    OR user_id = auth.uid()
  )
);