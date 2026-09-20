-- The money path's write surface.
--
-- creator_payout_profiles decides where a creator's earnings are sent. Its
-- UPDATE policy was named "(non-stripe fields)", but row-level security cannot
-- restrict columns, and `authenticated` held UPDATE on every column — so a
-- signed-in user could set their own stripe_connect_account_id and mark
-- themselves verified. These assertions exist so that cannot come back.
BEGIN;
SET LOCAL client_min_messages TO NOTICE;

DO $$
DECLARE
  _bad text;
BEGIN
  -- No browser-facing role may write a payout destination.
  SELECT string_agg(format('%s:%s', grantee, privilege_type), ', ')
  INTO _bad
  FROM information_schema.table_privileges
  WHERE table_schema = 'public'
    AND table_name = 'creator_payout_profiles'
    AND grantee IN ('anon', 'authenticated')
    AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'payout profiles are writable by a browser role: %', _bad;
  END IF;

  -- Column-level grants are the other way the same door opens.
  SELECT string_agg(format('%s:%s(%s)', grantee, privilege_type, column_name), ', ')
  INTO _bad
  FROM information_schema.column_privileges
  WHERE table_schema = 'public'
    AND table_name = 'creator_payout_profiles'
    AND grantee IN ('anon', 'authenticated')
    AND privilege_type IN ('INSERT', 'UPDATE');
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'payout profile columns are writable by a browser role: %', _bad;
  END IF;

  -- anon has no business here at all.
  SELECT string_agg(privilege_type, ', ') INTO _bad
  FROM information_schema.table_privileges
  WHERE table_schema = 'public' AND table_name = 'creator_payout_profiles' AND grantee = 'anon';
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'anon still reaches payout profiles: %', _bad;
  END IF;

  -- The owner must still be able to see their own profile.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_privileges
    WHERE table_schema = 'public' AND table_name = 'creator_payout_profiles'
      AND grantee = 'authenticated' AND privilege_type = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'owners can no longer read their payout profile';
  END IF;

  -- The server identity must still be able to do its job.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_privileges
    WHERE table_schema = 'public' AND table_name = 'creator_payout_profiles'
      AND grantee = 'service_role' AND privilege_type = 'UPDATE'
  ) THEN
    RAISE EXCEPTION 'service_role cannot write payout profiles';
  END IF;

  -- The earnings ledger is append-only from the server's side and read-only
  -- from the browser's. A creator who could write it could invent income.
  SELECT string_agg(format('%s:%s', grantee, privilege_type), ', ')
  INTO _bad
  FROM information_schema.table_privileges
  WHERE table_schema = 'public'
    AND table_name = 'creator_earnings_ledger'
    AND grantee IN ('anon', 'authenticated')
    AND privilege_type <> 'SELECT';
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'earnings ledger is writable by a browser role: %', _bad;
  END IF;

  -- RLS stays on: the grants above are the second lock, not the only one.
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.creator_payout_profiles'::regclass) THEN
    RAISE EXCEPTION 'RLS is disabled on creator_payout_profiles';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.creator_earnings_ledger'::regclass) THEN
    RAISE EXCEPTION 'RLS is disabled on creator_earnings_ledger';
  END IF;

  RAISE NOTICE 'ALL PAYOUT SURFACE ASSERTIONS PASSED';
END
$$;

ROLLBACK;
