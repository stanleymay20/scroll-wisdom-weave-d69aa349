\set ON_ERROR_STOP on

-- Fail closed if permissive storage write policies can bypass the canonical
-- owner-folder/service-role boundaries. Public SELECT policies are intentional
-- for public media buckets and are outside this write-authority contract.
DO $$
DECLARE
  bad_policy record;
BEGIN
  -- Legacy book-assets policies must be gone: with permissive RLS they OR with
  -- stricter policies and allow any authenticated user to overwrite/delete
  -- another user's object.
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

  -- Every book-assets browser write policy must be authenticated and owner-bound.
  FOR bad_policy IN
    SELECT policyname, cmd, roles, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND cmd IN ('INSERT', 'UPDATE', 'DELETE')
      AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) LIKE '%book-assets%'
      AND NOT (
        roles = ARRAY['authenticated'::name]
        AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) LIKE '%storage.foldername(name)%'
        AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) LIKE '%auth.uid()%'
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
      AND cmd IN ('INSERT', 'UPDATE', 'DELETE')
      AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) LIKE '%comic-panels%'
      AND NOT (
        roles = ARRAY['authenticated'::name]
        AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) LIKE '%storage.foldername(name)%'
        AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) LIKE '%auth.uid()%'
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

  -- study-music writes are server-owned. No PUBLIC/anon/authenticated policy may
  -- authorize INSERT based only on bucket_id.
  FOR bad_policy IN
    SELECT policyname, cmd, roles, qual, with_check
    FROM pg_policies
    WHERE schemaname='storage'
      AND tablename='objects'
      AND cmd='INSERT'
      AND coalesce(with_check, '') LIKE '%study-music%'
      AND roles <> ARRAY['service_role'::name]
  LOOP
    RAISE EXCEPTION 'unsafe study-music INSERT policy: % roles=% with_check=%',
      bad_policy.policyname, bad_policy.roles, bad_policy.with_check;
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
