-- Assert that the trusted server identity can actually reach every table.
--
-- This is the invariant 20260915190000 restored. It is asserted here, in the
-- fast database-schema job, because the only thing that previously noticed its
-- absence was a real Edge Function failing at runtime inside the slow GA E2E
-- job — and even then the reason was invisible, because a function that logs
-- the failure and answers the caller with a generic message leaves no trace in
-- CI. A missing GRANT must fail here, naming the table, not there.
--
-- No migration in this repository has ever revoked anything from service_role.
-- If a future table genuinely must withhold authority from the server identity,
-- that is a deliberate security decision: revoke it explicitly in a migration
-- that says why, and add the table to the exemption list below so this contract
-- keeps describing the real policy.

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  _exempt CONSTANT text[] := ARRAY[]::text[];
  _missing text;
BEGIN
  SELECT pg_catalog.string_agg(
           pg_catalog.format(
             '%s (missing: %s)',
             c.relname,
             pg_catalog.array_to_string(
               ARRAY(
                 SELECT p FROM pg_catalog.unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) AS p
                 WHERE NOT pg_catalog.has_table_privilege('service_role', c.oid, p)
               ),
               ', '
             )
           ),
           E'\n  ' ORDER BY c.relname
         )
    INTO _missing
  FROM pg_catalog.pg_class AS c
  WHERE c.relnamespace = 'public'::regnamespace
    AND c.relkind = 'r'
    AND NOT (c.relname = ANY (_exempt))
    AND NOT (
      pg_catalog.has_table_privilege('service_role', c.oid, 'SELECT')
      AND pg_catalog.has_table_privilege('service_role', c.oid, 'INSERT')
      AND pg_catalog.has_table_privilege('service_role', c.oid, 'UPDATE')
      AND pg_catalog.has_table_privilege('service_role', c.oid, 'DELETE')
    );

  IF _missing IS NOT NULL THEN
    RAISE EXCEPTION E'service_role lacks table authority on:\n  %\n\nGrant it in a migration (GRANT ALL ON TABLE public.<table> TO service_role), or add the table to _exempt in this contract if withholding it is deliberate.', _missing;
  END IF;
END;
$$;

-- The account-deletion path is asserted by name as well as by the schema-wide
-- rule above. It is the GDPR/CCPA erasure route, it is fail-closed, and it is
-- the path whose breakage motivated both this contract and 20260915190000, so
-- it is worth a failure message that says so rather than one that only says a
-- table is missing a grant.
DO $$
DECLARE
  _deletion_surface CONSTANT text[] := ARRAY[
    -- book-scoped, cleared via book_id
    'book_citations', 'book_knowledge_graphs', 'concept_edges', 'concept_nodes',
    'book_audits', 'book_collaborators', 'chapters', 'content_reports', 'books',
    -- user-scoped, cleared via user_id
    'learner_concept_states', 'quiz_question_history', 'spaced_repetition_cards',
    'learning_progress', 'competency_progress', 'competency_profile',
    'reading_sessions', 'reading_streaks', 'reading_goals',
    'saved_learning_decks', 'saved_decks', 'highlights', 'study_notes',
    'quiz_attempts', 'assessment_integrity_logs', 'bookmarks',
    'chapter_edit_sessions', 'audit_telemetry', 'pmf_events',
    'ai_usage_tracking', 'user_roles', 'profiles',
    -- retained and revoked rather than deleted
    'publishing_certificates', 'competency_certificates'
  ];
  _table text;
BEGIN
  FOREACH _table IN ARRAY _deletion_surface LOOP
    IF pg_catalog.to_regclass('public.' || _table) IS NULL THEN
      RAISE EXCEPTION 'delete-account targets public.%, which does not exist', _table;
    END IF;
    IF NOT pg_catalog.has_table_privilege('service_role', ('public.' || _table)::regclass, 'DELETE') THEN
      RAISE EXCEPTION 'delete-account cannot clear public.%: service_role has no DELETE. Account deletion would fail closed and no user could erase their data.', _table;
    END IF;
  END LOOP;
END;
$$;

ROLLBACK;
