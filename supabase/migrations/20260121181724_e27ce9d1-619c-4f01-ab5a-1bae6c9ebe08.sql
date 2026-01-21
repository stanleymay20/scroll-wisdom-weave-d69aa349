-- FIX SECURITY LINTER ISSUES

-- 1. Drop the SECURITY DEFINER view and recreate as SECURITY INVOKER
DROP VIEW IF EXISTS public.public_books;

CREATE VIEW public.public_books 
WITH (security_invoker = true)
AS
SELECT 
  id,
  title,
  description,
  category,
  book_type,
  cover_image_url,
  language,
  total_chapters,
  author_display_name,
  author_ai_agent,
  is_featured,
  is_published,
  created_at
FROM public.books
WHERE is_published = true;

GRANT SELECT ON public.public_books TO anon, authenticated;

-- 2. Fix overly permissive INSERT policy on security_audit_log
DROP POLICY IF EXISTS "Service can insert audit logs" ON public.security_audit_log;

-- Only allow authenticated users to insert their own audit logs
CREATE POLICY "Authenticated users can insert audit logs"
ON public.security_audit_log
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (user_id IS NULL OR user_id = auth.uid())
);

-- 3. Fix rate_limit_log - drop the false policy and use proper service-only access
DROP POLICY IF EXISTS "Rate limit logs are system only" ON public.rate_limit_log;

-- This table should only be accessed by service role (edge functions)
-- No user policies needed - edge functions use service role key