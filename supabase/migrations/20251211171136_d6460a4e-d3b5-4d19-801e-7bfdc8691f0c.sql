-- Fix contact_submissions RLS: Add policy for admins/moderators to view all
CREATE POLICY "Admins can view all contact submissions"
ON public.contact_submissions
FOR SELECT
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'moderator'));