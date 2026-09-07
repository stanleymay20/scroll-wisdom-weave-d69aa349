-- Restore the table-level privileges required by the existing RLS-protected
-- ScrollLibrary reader and library flows.
--
-- PostgreSQL table privileges are evaluated before row-level security. The
-- tracked schema has owner-scoped RLS policies for profiles, user_library and
-- highlights, but a fresh replay did not grant authenticated users the table
-- privileges needed to reach those policies. This caused legitimate browser
-- reads to fail with 42501 before RLS was evaluated and also broke the chapter
-- policy that checks user_library membership.
--
-- These grants do NOT bypass RLS. They only permit the authenticated role to
-- execute the operations already constrained by the existing row policies.

GRANT SELECT ON TABLE public.profiles TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.user_library
  TO authenticated;

GRANT SELECT, INSERT, DELETE
  ON TABLE public.highlights
  TO authenticated;

-- Service execution retains full access explicitly.
GRANT ALL ON TABLE public.profiles, public.user_library, public.highlights TO service_role;

DO $$
BEGIN
  IF NOT has_table_privilege('authenticated', 'public.profiles', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated must be able to SELECT profiles through RLS';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.user_library', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.user_library', 'INSERT')
     OR NOT has_table_privilege('authenticated', 'public.user_library', 'UPDATE')
     OR NOT has_table_privilege('authenticated', 'public.user_library', 'DELETE') THEN
    RAISE EXCEPTION 'authenticated user_library CRUD privileges are incomplete';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.highlights', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.highlights', 'INSERT')
     OR NOT has_table_privilege('authenticated', 'public.highlights', 'DELETE') THEN
    RAISE EXCEPTION 'authenticated highlight privileges are incomplete';
  END IF;
END
$$;
