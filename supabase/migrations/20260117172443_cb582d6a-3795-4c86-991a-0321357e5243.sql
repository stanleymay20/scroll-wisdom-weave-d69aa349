-- Fix mastery_attempts INSERT policy - require user authentication
DROP POLICY IF EXISTS "Service can insert mastery attempts" ON public.mastery_attempts;

CREATE POLICY "Users can insert their own mastery attempts"
ON public.mastery_attempts
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Fix moderation_queue INSERT policy - only allow authenticated admins/moderators
DROP POLICY IF EXISTS "System can insert to queue" ON public.moderation_queue;

CREATE POLICY "Admins and moderators can insert to moderation queue"
ON public.moderation_queue
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role IN ('admin', 'moderator')
  )
);