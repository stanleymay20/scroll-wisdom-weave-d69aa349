\set ON_ERROR_STOP on

-- Fail closed if permissive storage write policies can bypass the canonical
-- owner-folder/service-role boundaries. Public SELECT policies are intentional
-- for public media buckets and are outside this write-authority contract.
DO $$
DECLARE
  bad_policy record;
BEGIN
  -- A permissive browser-write policy with no bucket predicate is global and
  -- can authorize writes to every bucket, regardless of stricter policies.
  FOR bad_policy IN
    SELECT policyname, cmd, roles, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND permissive = 'PERMISSIVE'
      AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
      AND roles && ARRAY['public'::name, 'anon'::name, 'authenticated'::name]
      AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) NOT LIKE '%bucket_id%'
  LOOP
    RAISE EXCEPTION 'global permissive browser storage-write policy: % (%) roles=% qual=% with_check=%',
      bad_policy.policyname, bad_policy.cmd, bad_policy.roles, bad_policy.qual, bad_policy.with_check;
  END LOOP;

  -- Legacy book-assets policies must be gone: permissive RLS policies OR
  -- together, so these broaden the newer owner-folder rules.
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname IN (
        'Users can upload book assets',
        'Users can update own book assets',
        'Users can delete own book assets'
      )
  ) THEN
    RAISE EXCEPTION 'legacy broad book-assets write policy still exists';
  END IF;

  -- Every permissive browser policy that can write book-assets must be
  -- operation-specific, authenticated-only, and owner-bound. FOR ALL is
  -- deliberately rejected so a single rule cannot silently broaden multiple
  -- write operations later.
  FOR bad_policy IN
    SELECT policyname, cmd, roles, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND permissive = 'PERMISSIVE'
      AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
      AND roles && ARRAY['public'::name, 'anon'::name, 'authenticated'::name]
      AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) LIKE '%book-assets%'
      AND NOT (
        roles = ARRAY['authenticated'::name]
        AND CASE cmd
          WHEN 'INSERT' THEN
            coalesce(with_check, '') LIKE '%book-assets%'
            AND coalesce(with_check, '') LIKE '%storage.foldername(name)%'
            AND coalesce(with_check, '') LIKE '%auth.uid()%'
          WHEN 'UPDATE' THEN
            coalesce(qual, '') LIKE '%book-assets%'
            AND coalesce(qual, '') LIKE '%storage.foldername(name)%'
            AND coalesce(qual, '') LIKE '%auth.uid()%'
            AND coalesce(with_check, '') LIKE '%book-assets%'
            AND coalesce(with_check, '') LIKE '%storage.foldername(name)%'
            AND coalesce(with_check, '') LIKE '%auth.uid()%'
          WHEN 'DELETE' THEN
            coalesce(qual, '') LIKE '%book-assets%'
            AND coalesce(qual, '') LIKE '%storage.foldername(name)%'
            AND coalesce(qual, '') LIKE '%auth.uid()%'
          ELSE false
        END
      )
  LOOP
    RAISE EXCEPTION 'unsafe book-assets write policy: % (%) roles=% qual=% with_check=%',
      bad_policy.policyname, bad_policy.cmd, bad_policy.roles, bad_policy.qual, bad_policy.with_check;
  END LOOP;

  -- Assert all three canonical book-assets write operations exist.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='Users upload own book assets' AND cmd='INSERT'
      AND roles = ARRAY['authenticated'::name]
      AND coalesce(with_check, '') LIKE '%book-assets%'
      AND coalesce(with_check, '') LIKE '%storage.foldername(name)%'
      AND coalesce(with_check, '') LIKE '%auth.uid()%'
  ) THEN
    RAISE EXCEPTION 'canonical owner-bound book-assets INSERT policy missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='Users update own book assets' AND cmd='UPDATE'
      AND roles = ARRAY['authenticated'::name]
      AND coalesce(qual, '') LIKE '%book-assets%'
      AND coalesce(qual, '') LIKE '%storage.foldername(name)%'
      AND coalesce(qual, '') LIKE '%auth.uid()%'
      AND coalesce(with_check, '') LIKE '%book-assets%'
      AND coalesce(with_check, '') LIKE '%storage.foldername(name)%'
      AND coalesce(with_check, '') LIKE '%auth.uid()%'
  ) THEN
    RAISE EXCEPTION 'canonical owner-bound book-assets UPDATE policy missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='Users delete own book assets' AND cmd='DELETE'
      AND roles = ARRAY['authenticated'::name]
      AND coalesce(qual, '') LIKE '%book-assets%'
      AND coalesce(qual, '') LIKE '%storage.foldername(name)%'
      AND coalesce(qual, '') LIKE '%auth.uid()%'
  ) THEN
    RAISE EXCEPTION 'canonical owner-bound book-assets DELETE policy missing';
  END IF;

  -- The legacy comic INSERT allowed any authenticated user to choose another
  -- user's folder. It must not coexist with the canonical owner-folder policy.
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='Authenticated users can upload comic panels'
  ) THEN
    RAISE EXCEPTION 'legacy broad comic-panels INSERT policy still exists';
  END IF;

  FOR bad_policy IN
    SELECT policyname, cmd, roles, qual, with_check
    FROM pg_policies
    WHERE schemaname='storage'
      AND tablename='objects'
      AND permissive = 'PERMISSIVE'
      AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
      AND roles && ARRAY['public'::name, 'anon'::name, 'authenticated'::name]
      AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) LIKE '%comic-panels%'
      AND NOT (
        roles = ARRAY['authenticated'::name]
        AND CASE cmd
          WHEN 'INSERT' THEN
            coalesce(with_check, '') LIKE '%comic-panels%'
            AND coalesce(with_check, '') LIKE '%storage.foldername(name)%'
            AND coalesce(with_check, '') LIKE '%auth.uid()%'
          WHEN 'UPDATE' THEN
            coalesce(qual, '') LIKE '%comic-panels%'
            AND coalesce(qual, '') LIKE '%storage.foldername(name)%'
            AND coalesce(qual, '') LIKE '%auth.uid()%'
            AND coalesce(with_check, '') LIKE '%comic-panels%'
            AND coalesce(with_check, '') LIKE '%storage.foldername(name)%'
            AND coalesce(with_check, '') LIKE '%auth.uid()%'
          WHEN 'DELETE' THEN
            coalesce(qual, '') LIKE '%comic-panels%'
            AND coalesce(qual, '') LIKE '%storage.foldername(name)%'
            AND coalesce(qual, '') LIKE '%auth.uid()%'
          ELSE false
        END
      )
  LOOP
    RAISE EXCEPTION 'unsafe comic-panels write policy: % (%) roles=% qual=% with_check=%',
      bad_policy.policyname, bad_policy.cmd, bad_policy.roles, bad_policy.qual, bad_policy.with_check;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='Users upload own comic panels' AND cmd='INSERT'
      AND roles = ARRAY['authenticated'::name]
      AND coalesce(with_check, '') LIKE '%comic-panels%'
      AND coalesce(with_check, '') LIKE '%storage.foldername(name)%'
      AND coalesce(with_check, '') LIKE '%auth.uid()%'
  ) THEN
    RAISE EXCEPTION 'canonical owner-bound comic-panels INSERT policy missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='Users can update their own comic panels' AND cmd='UPDATE'
      AND roles = ARRAY['authenticated'::name]
      AND coalesce(qual, '') LIKE '%comic-panels%'
      AND coalesce(qual, '') LIKE '%storage.foldername(name)%'
      AND coalesce(qual, '') LIKE '%auth.uid()%'
      AND coalesce(with_check, '') LIKE '%comic-panels%'
      AND coalesce(with_check, '') LIKE '%storage.foldername(name)%'
      AND coalesce(with_check, '') LIKE '%auth.uid()%'
  ) THEN
    RAISE EXCEPTION 'canonical owner-bound comic-panels UPDATE policy missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='Users can delete their own comic panels' AND cmd='DELETE'
      AND roles = ARRAY['authenticated'::name]
      AND coalesce(qual, '') LIKE '%comic-panels%'
      AND coalesce(qual, '') LIKE '%storage.foldername(name)%'
      AND coalesce(qual, '') LIKE '%auth.uid()%'
  ) THEN
    RAISE EXCEPTION 'canonical owner-bound comic-panels DELETE policy missing';
  END IF;

  -- study-music is server-owned. Any permissive browser-role write rule scoped
  -- to this bucket is a release blocker; a global browser rule was rejected at
  -- the top of this test.
  FOR bad_policy IN
    SELECT policyname, cmd, roles, qual, with_check
    FROM pg_policies
    WHERE schemaname='storage'
      AND tablename='objects'
      AND permissive = 'PERMISSIVE'
      AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
      AND roles && ARRAY['public'::name, 'anon'::name, 'authenticated'::name]
      AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) LIKE '%study-music%'
  LOOP
    RAISE EXCEPTION 'unsafe study-music browser write policy: % (%) roles=% qual=% with_check=%',
      bad_policy.policyname, bad_policy.cmd, bad_policy.roles, bad_policy.qual, bad_policy.with_check;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='Service role can upload study music' AND cmd='INSERT'
      AND roles = ARRAY['service_role'::name]
      AND coalesce(with_check, '') LIKE '%study-music%'
  ) THEN
    RAISE EXCEPTION 'service-role-only study-music INSERT policy missing';
  END IF;
END
$$;

SELECT 'storage owner/service-role write boundaries: PASS' AS result;
