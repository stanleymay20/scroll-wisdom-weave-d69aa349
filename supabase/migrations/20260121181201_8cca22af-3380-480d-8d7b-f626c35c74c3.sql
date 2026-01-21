-- IVY LEAGUE SECURITY HARDENING MIGRATION (v2)
-- Fixes 3 CRITICAL security vulnerabilities identified in audit

-- ================================================
-- 1. ADD ROLE COLUMN TO PROFILES (needed for admin checks)
-- ================================================
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin', 'moderator'));

-- ================================================
-- 2. PUBLISHING CERTIFICATES - Restrict public exposure
-- ================================================
DROP POLICY IF EXISTS "Certificates are publicly viewable for verification" ON public.publishing_certificates;

-- Create a more restrictive policy - owners and admins only
CREATE POLICY "Certificates viewable by owner or admin"
ON public.publishing_certificates
FOR SELECT
USING (
  auth.uid() = user_id
  OR
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Create a security definer function for public verification (limited data exposure)
CREATE OR REPLACE FUNCTION public.verify_certificate(cert_number TEXT)
RETURNS TABLE (
  is_valid BOOLEAN,
  certificate_type TEXT,
  book_title TEXT,
  issued_at TIMESTAMPTZ,
  verification_hash TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pc.status = 'active' AND pc.revoked_at IS NULL AS is_valid,
    pc.certificate_type,
    b.title AS book_title,
    pc.issued_at,
    pc.verification_hash
  FROM publishing_certificates pc
  JOIN books b ON b.id = pc.book_id
  WHERE pc.certificate_number = cert_number
  LIMIT 1;
END;
$$;

-- ================================================
-- 3. CHAPTERS - Add secondary ownership check
-- ================================================
DROP POLICY IF EXISTS "View chapters of published books" ON public.chapters;

CREATE POLICY "View chapters of published books or owned"
ON public.chapters
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM books 
    WHERE books.id = chapters.book_id 
    AND books.creator_id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM books 
    WHERE books.id = chapters.book_id 
    AND books.is_published = true
  )
  OR
  EXISTS (
    SELECT 1 FROM user_library 
    WHERE user_library.book_id = chapters.book_id 
    AND user_library.user_id = auth.uid()
  )
);

-- ================================================
-- 4. CONTACT SUBMISSIONS - Restrict INSERT with validation
-- ================================================
DROP POLICY IF EXISTS "Anyone can create contact submissions" ON public.contact_submissions;

CREATE POLICY "Authenticated users can submit contact forms"
ON public.contact_submissions
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND
  (user_id IS NULL OR user_id = auth.uid())
);

-- ================================================
-- 5. ASSESSMENT INTEGRITY LOGS - Prevent manipulation
-- ================================================
DROP POLICY IF EXISTS "Prevent user manipulation of integrity logs" ON public.assessment_integrity_logs;

CREATE POLICY "Integrity logs are immutable for users"
ON public.assessment_integrity_logs
FOR UPDATE
USING (false);

CREATE POLICY "Integrity logs cannot be deleted by users"
ON public.assessment_integrity_logs
FOR DELETE
USING (false);

-- ================================================
-- 6. GRANT execute on verify function
-- ================================================
GRANT EXECUTE ON FUNCTION public.verify_certificate(TEXT) TO anon, authenticated;