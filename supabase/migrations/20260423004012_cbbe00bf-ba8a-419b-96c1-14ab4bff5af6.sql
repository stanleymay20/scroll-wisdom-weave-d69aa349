
-- 1. contact_submissions: explicit restrictive policies
DROP POLICY IF EXISTS "Submitter can view own submission" ON public.contact_submissions;
CREATE POLICY "Submitter can view own submission"
ON public.contact_submissions
FOR SELECT
TO authenticated
USING (user_id IS NOT NULL AND user_id = auth.uid());

-- Block anonymous SELECT explicitly via restrictive policy
DROP POLICY IF EXISTS "Block anonymous reads on contact submissions" ON public.contact_submissions;
CREATE POLICY "Block anonymous reads on contact submissions"
ON public.contact_submissions
AS RESTRICTIVE
FOR SELECT
TO anon
USING (false);

-- 2. book-images storage bucket: add ownership-scoped UPDATE, restrict listing
DROP POLICY IF EXISTS "Users can update own book images" ON storage.objects;
CREATE POLICY "Users can update own book images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'book-images' AND (auth.uid())::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'book-images' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- Tighten upload to require user-owned folder path
DROP POLICY IF EXISTS "Authenticated users can upload book images" ON storage.objects;
CREATE POLICY "Users can upload book images to own folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'book-images'
  AND auth.uid() IS NOT NULL
  AND (auth.uid())::text = (storage.foldername(name))[1]
);
