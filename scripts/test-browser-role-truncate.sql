-- No browser role may hold TRUNCATE on any table.
--
-- Row-level security governs SELECT, INSERT, UPDATE and DELETE. It does not
-- govern TRUNCATE: a policy restricting a creator to their own row does
-- nothing against `TRUNCATE public.books`. Supabase grants browser roles every
-- privilege on public tables by default, so this is the one that has to be
-- taken back explicitly — and forgotten on any new table unless the default
-- privileges are also changed.
BEGIN;
SET LOCAL client_min_messages TO NOTICE;

DO $$
DECLARE
  _offenders text;
  _n integer;
BEGIN
  SELECT count(*), string_agg(format('%s:%s(%s)', grantee, privilege_type, table_name), ', ' ORDER BY table_name)
  INTO _n, _offenders
  FROM information_schema.table_privileges
  WHERE table_schema = 'public'
    AND grantee IN ('anon', 'authenticated')
    AND privilege_type IN ('TRUNCATE', 'TRIGGER', 'REFERENCES');

  IF _n > 0 THEN
    RAISE EXCEPTION 'browser roles hold % privilege(s) RLS cannot restrain: %',
      _n, left(_offenders, 800);
  END IF;

  -- The server identity must keep them, or maintenance paths break.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_privileges
    WHERE table_schema = 'public' AND grantee = 'service_role' AND privilege_type = 'TRUNCATE'
  ) THEN
    RAISE EXCEPTION 'service_role lost TRUNCATE across the schema';
  END IF;

  -- Ordinary row access is untouched: this must not have turned into a
  -- blanket lockout of the client.
  SELECT count(*) INTO _n
  FROM information_schema.table_privileges
  WHERE table_schema = 'public' AND grantee = 'authenticated' AND privilege_type = 'SELECT';
  IF _n = 0 THEN
    RAISE EXCEPTION 'authenticated can no longer read any table';
  END IF;

  RAISE NOTICE 'ALL BROWSER-ROLE TRUNCATE ASSERTIONS PASSED (authenticated retains SELECT on % table(s))', _n;
END
$$;

ROLLBACK;
