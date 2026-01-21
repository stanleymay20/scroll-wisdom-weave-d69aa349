-- Fix RLS enabled but no policy on rate_limit_log
-- Add a deny-all policy for users (only service role should access)
CREATE POLICY "No user access to rate limit logs"
ON public.rate_limit_log
FOR SELECT
USING (false);

CREATE POLICY "No user insert to rate limit logs"
ON public.rate_limit_log
FOR INSERT
WITH CHECK (false);

CREATE POLICY "No user update to rate limit logs"
ON public.rate_limit_log
FOR UPDATE
USING (false);

CREATE POLICY "No user delete to rate limit logs"
ON public.rate_limit_log
FOR DELETE
USING (false);