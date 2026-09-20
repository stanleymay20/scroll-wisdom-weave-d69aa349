-- Assert that the trusted server identity can actually reach every table and
-- that browser roles cannot mint authoritative credential evidence.
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

DO $$
DECLARE
  _deletion_surface CONSTANT text[] := ARRAY[
    'book_citations', 'book_knowledge_graphs', 'concept_edges', 'concept_nodes',
    'book_audits', 'book_collaborators', 'chapters', 'content_reports', 'books',
    'learner_concept_states', 'quiz_question_history', 'spaced_repetition_cards',
    'learning_progress', 'competency_progress', 'competency_profile',
    'reading_sessions', 'reading_streaks', 'reading_goals',
    'saved_learning_decks', 'saved_decks', 'highlights', 'study_notes',
    'assessment_session_answers', 'assessment_sessions',
    'quiz_attempts', 'assessment_integrity_logs', 'mastery_attempts',
    'bookmarks', 'chapter_edit_sessions', 'audit_telemetry', 'pmf_events',
    'ai_usage_tracking', 'user_roles', 'profiles',
    'publishing_certificates', 'competency_certificates'
  ];
  _table text;
BEGIN
  FOREACH _table IN ARRAY _deletion_surface LOOP
    IF pg_catalog.to_regclass('public.' || _table) IS NULL THEN
      RAISE EXCEPTION 'delete-account targets public.%, which does not exist', _table;
    END IF;
    IF NOT pg_catalog.has_table_privilege('service_role', ('public.' || _table)::regclass, 'DELETE') THEN
      RAISE EXCEPTION 'delete-account cannot clear public.%: service_role has no DELETE. Account deletion would fail closed.', _table;
    END IF;
  END LOOP;
END;
$$;

-- Contract 6B/6C evidence authority: authenticated browser sessions may read
-- their permitted evidence through RLS, but may not mint or rewrite the rows
-- used by the certificate authority.
DO $$
BEGIN
  IF pg_catalog.has_table_privilege('authenticated', 'public.quiz_attempts', 'INSERT')
     OR pg_catalog.has_table_privilege('authenticated', 'public.quiz_attempts', 'UPDATE')
     OR pg_catalog.has_table_privilege('authenticated', 'public.quiz_attempts', 'DELETE') THEN
    RAISE EXCEPTION 'Contract 6C broken: authenticated can mutate authoritative quiz_attempts';
  END IF;

  IF pg_catalog.has_table_privilege('authenticated', 'public.assessment_integrity_logs', 'INSERT')
     OR pg_catalog.has_table_privilege('authenticated', 'public.assessment_integrity_logs', 'UPDATE')
     OR pg_catalog.has_table_privilege('authenticated', 'public.assessment_integrity_logs', 'DELETE') THEN
    RAISE EXCEPTION 'Contract 6B broken: authenticated can mutate authoritative integrity evidence';
  END IF;

  IF pg_catalog.has_table_privilege('authenticated', 'public.mastery_attempts', 'INSERT')
     OR pg_catalog.has_table_privilege('authenticated', 'public.mastery_attempts', 'UPDATE')
     OR pg_catalog.has_table_privilege('authenticated', 'public.mastery_attempts', 'DELETE') THEN
    RAISE EXCEPTION 'Contract 6C broken: authenticated can mutate mastery evidence';
  END IF;

  IF pg_catalog.has_function_privilege(
    'authenticated',
    'public.insert_integrity_log(uuid, uuid, uuid, text, numeric, jsonb)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Contract 6B broken: authenticated can invoke insert_integrity_log';
  END IF;

  IF pg_catalog.has_table_privilege('authenticated', 'public.assessment_sessions', 'SELECT')
     OR pg_catalog.has_table_privilege('authenticated', 'public.assessment_sessions', 'INSERT')
     OR pg_catalog.has_table_privilege('authenticated', 'public.assessment_session_answers', 'SELECT') THEN
    RAISE EXCEPTION 'Contract 8 broken: browser role can bypass assessment-session authority or read answer keys';
  END IF;
END;
$$;

-- Contract 12/8 snapshot columns must exist on the retained record.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'publishing_certificates' AND column_name = 'book_content_hash'
  ) THEN
    RAISE EXCEPTION 'Contract 12 broken: publishing_certificates.book_content_hash missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'publishing_certificates' AND column_name = 'assessment_contract_passed'
  ) THEN
    RAISE EXCEPTION 'Contract 8 broken: publishing_certificates.assessment_contract_passed missing';
  END IF;
END;
$$;

ROLLBACK;
