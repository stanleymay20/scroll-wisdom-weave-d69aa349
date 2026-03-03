-- Drop existing SELECT policy that lets submitters view their own
DROP POLICY IF EXISTS "Users can view own submissions" ON public.contact_submissions;

-- Only admins/moderators can view contact submissions  
CREATE POLICY "Admins can view contact submissions"
ON public.contact_submissions
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')
);

-- Tighten tts_usage: allow users to insert/update own usage (currently missing)
CREATE POLICY "Users can insert own tts usage"
ON public.tts_usage
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tts usage"
ON public.tts_usage
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);