-- Production convergence for the study-music storage write boundary.
-- Public reads remain intentional. Browser/public writes are not.
-- service_role bypasses RLS, but retaining an explicit narrowly-scoped policy
-- keeps the intended contract inspectable by release verification.

DROP POLICY IF EXISTS "Service role can upload study music" ON storage.objects;
CREATE POLICY "Service role can upload study music"
  ON storage.objects
  FOR INSERT
  TO service_role
  WITH CHECK (bucket_id = 'study-music');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND cmd IN ('INSERT','ALL')
      AND roles && ARRAY['public'::name, 'anon'::name, 'authenticated'::name]
      AND COALESCE(with_check, '') ILIKE '%study-music%'
  ) THEN
    RAISE EXCEPTION 'study-music has a browser/public write policy';
  END IF;
END
$$;
