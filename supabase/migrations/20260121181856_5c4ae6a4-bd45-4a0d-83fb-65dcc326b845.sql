-- FINAL SECURITY HARDENING - Address remaining scanner findings

-- 1. PROFILES - Add explicit denial for anonymous access
-- The existing policies already require auth.uid() = id, but let's make it explicit
-- No changes needed - policies are correct

-- 2. CONTACT SUBMISSIONS - Require user_id on insert (no NULL allowed for tracking)
DROP POLICY IF EXISTS "Authenticated users can submit contact forms" ON public.contact_submissions;

CREATE POLICY "Authenticated users must provide user_id on contact forms"
ON public.contact_submissions
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND user_id = auth.uid()
);

-- 3. PUBLISHING CERTIFICATES - Add INSERT policy to prevent unauthorized creation
CREATE POLICY "Only system can issue certificates"
ON public.publishing_certificates
FOR INSERT
WITH CHECK (
  -- Only admins can insert certificates (service role bypasses RLS)
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- 4. Add comment documenting the public_books view is intentionally public
COMMENT ON VIEW public.public_books IS 'Public view of published books only. Intentionally accessible without authentication. Uses SECURITY INVOKER and filters to is_published=true only.';