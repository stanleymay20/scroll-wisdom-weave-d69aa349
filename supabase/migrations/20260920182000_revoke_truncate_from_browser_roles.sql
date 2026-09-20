-- Take TRUNCATE away from the browser.
--
-- Supabase grants anon and authenticated every privilege on tables in the
-- public schema and relies on row-level security to keep users inside their
-- own rows. That works for SELECT, INSERT, UPDATE and DELETE, which RLS
-- filters.
--
-- It does not work for TRUNCATE. TRUNCATE is not subject to row-level
-- security at all — a policy restricting a creator to their own row does
-- nothing against `TRUNCATE public.books`. Any signed-in user holding the
-- privilege can empty an entire table in one statement, and no policy in this
-- database can stop them.
--
-- Forty-four tables here were hardened individually, each with a migration
-- ending in `REVOKE ALL ON TABLE public.x FROM PUBLIC, anon, authenticated`.
-- The other eighty-three never received one and still carry the defaults. That
-- is the same omission that left service_role unable to reach half the schema
-- (20260915190000), seen from the other side: a per-table line that is easy to
-- forget and whose absence is invisible until someone exercises it.
--
-- This was found by CI. A test asserting that browser roles cannot write
-- creator_payout_profiles passed locally and failed on a real Supabase
-- database with `authenticated:TRUNCATE` — a privilege the local harness did
-- not reproduce and the migration had not thought to revoke.
--
-- Nothing in a browser has ever needed TRUNCATE. It is bulk DDL-adjacent
-- maintenance, and the application performs it nowhere: the server identity
-- keeps it, and deletes that users are genuinely allowed to make still go
-- through DELETE, where RLS applies. TRIGGER and REFERENCES go with it for the
-- same reason — they let a role attach triggers and foreign keys to a table,
-- which is schema authorship, not something a page does.
--
-- INSERT, UPDATE and DELETE are deliberately left alone. Plenty of tables here
-- are written directly from the client under RLS, which is how Supabase is
-- meant to work; revoking those wholesale would break the application. This
-- migration removes only the privileges that RLS cannot govern and that no
-- client legitimately uses.

DO $$
DECLARE
  _table record;
  _count integer := 0;
BEGIN
  FOR _table IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      -- Ordinary tables, partitioned tables, views and materialized views.
      -- Views carry the same privilege bits as tables and were missed by an
      -- earlier draft that matched 'r' alone; the test below caught three of
      -- them still holding the grants.
      AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
    ORDER BY c.relname
  LOOP
    EXECUTE format(
      'REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE public.%I FROM anon, authenticated',
      _table.relname
    );
    _count := _count + 1;
  END LOOP;

  RAISE NOTICE 'Revoked TRUNCATE/TRIGGER/REFERENCES from browser roles on % table(s)', _count;
END
$$;

-- Tables created after this migration must not re-acquire what was just taken
-- away. Migrations run as `postgres`, so the defaults are recorded for that
-- role — the same reasoning as 20260915190000, which had to do this to make
-- service_role's grants stick to future tables.
-- ON TABLES covers views and materialized views too; Postgres uses the same
-- default-privilege class for every relation with a table-shaped ACL.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM authenticated;

-- scripts/test-browser-role-truncate.sql asserts the invariant in CI.
