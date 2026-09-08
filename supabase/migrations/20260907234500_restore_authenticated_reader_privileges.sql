-- Restore the table-level privileges required by the existing RLS-protected
-- ScrollLibrary reader and library flows.
--
-- PostgreSQL table privileges are evaluated before row-level security. A fresh
-- repository replay exposed several tables whose owner-scoped RLS policies were
-- correct, but whose browser roles could not reach those policies at all. The
-- result was PostgREST 42501 failures inside otherwise legitimate reader flows.
--
-- These grants do NOT bypass RLS. They only permit the browser roles to execute
-- operations already constrained by the existing row policies.

GRANT SELECT ON TABLE public.profiles TO authenticated;

-- Authenticated users need normal library CRUD. Anonymous SELECT is required
-- only so chapter RLS expressions that reference user_library can be evaluated;
-- auth.uid() is NULL for anon, so the existing owner policy exposes zero rows.
GRANT SELECT ON TABLE public.user_library TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.user_library
  TO authenticated;

GRANT SELECT, INSERT, DELETE
  ON TABLE public.highlights
  TO authenticated;

-- A chapter SELECT policy checks accepted collaboration membership. Without
-- SELECT on the referenced table, PostgreSQL rejects the chapter query before
-- it can evaluate the other published/owner branches of the RLS policy.
GRANT SELECT ON TABLE public.book_collaborators TO authenticated;

-- Reader runtime persistence. Each grant mirrors an already-existing RLS policy
-- and the operations issued by the reader hooks; no extra delete/admin authority
-- is introduced.
GRANT SELECT, INSERT, UPDATE ON TABLE public.reading_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.reading_goals TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.user_gamification TO authenticated;
GRANT SELECT, INSERT ON TABLE public.quiz_attempts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.competency_progress TO authenticated;
GRANT INSERT ON TABLE public.pmf_events TO authenticated;

-- Service execution retains full access explicitly.
GRANT ALL ON TABLE
  public.profiles,
  public.user_library,
  public.highlights,
  public.book_collaborators,
  public.reading_sessions,
  public.reading_goals,
  public.user_gamification,
  public.quiz_attempts,
  public.competency_progress,
  public.pmf_events
TO service_role;

DO $$
BEGIN
  IF NOT has_table_privilege('authenticated', 'public.profiles', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated must be able to SELECT profiles through RLS';
  END IF;

  IF NOT has_table_privilege('anon', 'public.user_library', 'SELECT') THEN
    RAISE EXCEPTION 'anon must be able to evaluate user_library-backed chapter RLS';
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

  IF NOT has_table_privilege('authenticated', 'public.book_collaborators', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated chapter RLS cannot evaluate book_collaborators';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.reading_sessions', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.reading_sessions', 'INSERT')
     OR NOT has_table_privilege('authenticated', 'public.reading_sessions', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated reading_sessions privileges are incomplete';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.reading_goals', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.reading_goals', 'INSERT')
     OR NOT has_table_privilege('authenticated', 'public.reading_goals', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated reading_goals privileges are incomplete';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.user_gamification', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.user_gamification', 'INSERT')
     OR NOT has_table_privilege('authenticated', 'public.user_gamification', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated user_gamification privileges are incomplete';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.quiz_attempts', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.quiz_attempts', 'INSERT') THEN
    RAISE EXCEPTION 'authenticated quiz_attempts privileges are incomplete';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.competency_progress', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.competency_progress', 'INSERT')
     OR NOT has_table_privilege('authenticated', 'public.competency_progress', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated competency_progress privileges are incomplete';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.pmf_events', 'INSERT') THEN
    RAISE EXCEPTION 'authenticated must be able to INSERT own PMF events through RLS';
  END IF;
END
$$;
