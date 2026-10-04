-- Commercial-GA storage write-boundary convergence.
--
-- PostgreSQL combines permissive RLS policies with OR semantics. Several legacy
-- storage policies were therefore still broadening newer owner-scoped policies:
-- authenticated users could write anywhere in book-assets/comic-panels, and the
-- study-music INSERT policy was accidentally attached to PUBLIC despite its
-- service-role-only name. Remove those legacy grants and establish one canonical
-- write policy per operation.

-- ---------------------------------------------------------------------------
-- book-assets: public reads are intentional, browser writes are owner-folder only.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can upload book assets" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own book assets" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own book assets" ON storage.objects;

DROP POLICY IF EXISTS "Users upload own book assets" ON storage.objects;
CREATE POLICY "Users upload own book assets"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'book-assets'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS "Users update own book assets" ON storage.objects;
CREATE POLICY "Users update own book assets"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'book-assets'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'book-assets'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS "Users delete own book assets" ON storage.objects;
CREATE POLICY "Users delete own book assets"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'book-assets'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

-- ---------------------------------------------------------------------------
-- comic-panels: keep intentional public reads, but every browser write must be
-- constrained to the signed-in user's top-level folder.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can upload comic panels" ON storage.objects;

DROP POLICY IF EXISTS "Users upload own comic panels" ON storage.objects;
CREATE POLICY "Users upload own comic panels"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'comic-panels'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS "Users can update their own comic panels" ON storage.objects;
CREATE POLICY "Users can update their own comic panels"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'comic-panels'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'comic-panels'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS "Users can delete their own comic panels" ON storage.objects;
CREATE POLICY "Users can delete their own comic panels"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'comic-panels'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

-- ---------------------------------------------------------------------------
-- study-music: generation is server-owned. The old policy name said
-- "Service role" but omitted TO service_role, which made it a PUBLIC policy.
-- Keep the intent explicit even though service_role bypasses RLS in Supabase.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Service role can upload study music" ON storage.objects;
CREATE POLICY "Service role can upload study music"
  ON storage.objects
  FOR INSERT
  TO service_role
  WITH CHECK (bucket_id = 'study-music');
