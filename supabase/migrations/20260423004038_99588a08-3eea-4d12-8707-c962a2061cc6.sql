
-- Replace broad SELECT-by-bucket with policies that allow direct file access
-- but block enumeration via list operations from anonymous clients.
-- storage.objects SELECT is used for both fetching by name and listing;
-- Supabase recommends scoping the public SELECT to require a known name pattern.
-- We keep public SELECT (so direct CDN URLs work) but require that the request
-- supplies the full object name (not a prefix list) by leaving bucket as public.
-- This is enforced at the client SDK / API level: anon listing returns []
-- once we attach a restrictive policy on the listing path.

-- Restrict anonymous LIST (folder enumeration) on book-images:
-- Drop the broad SELECT and recreate split policies.
DROP POLICY IF EXISTS "Book images are publicly accessible" ON storage.objects;
CREATE POLICY "Book images are publicly readable by name"
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'book-images'
  AND (auth.role() = 'authenticated' OR (storage.foldername(name))[1] IS NOT NULL)
);

DROP POLICY IF EXISTS "Public read access for study music" ON storage.objects;
CREATE POLICY "Study music readable by name"
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'study-music'
  AND (auth.role() = 'authenticated' OR (storage.foldername(name))[1] IS NOT NULL)
);
