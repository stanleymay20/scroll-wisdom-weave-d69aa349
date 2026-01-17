-- Add proper admin RLS policies for FAQs table
-- Only admins can INSERT, UPDATE, DELETE FAQs

CREATE POLICY "Admins can manage FAQs"
ON public.faqs
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role = 'admin'
  )
);