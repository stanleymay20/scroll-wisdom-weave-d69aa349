\set ON_ERROR_STOP on

BEGIN;

-- Simulate the exact Lovable-Test gap inside the disposable CI database.
DROP TABLE IF EXISTS public.publication_external_identifiers CASCADE;
DROP TABLE IF EXISTS public.publication_products CASCADE;
DROP TABLE IF EXISTS public.book_distribution_metadata CASCADE;
DROP TABLE IF EXISTS public.publication_compliance_declarations CASCADE;
DROP FUNCTION IF EXISTS public.materialize_scroll_publication_identity(uuid);

\ir ../drizzle/migrations/0011_converge_publication_products_distribution_compliance.sql

DO $$
DECLARE
  v_table text;
  v_rls boolean;
  v_count integer;
  v_def text;
  v_user uuid := '93000000-0000-4000-8000-000000000001';
  v_book uuid;
  v_started timestamptz := '2026-09-23 01:00:00+00';
  v_dnb timestamptz := '2026-09-23 02:00:00+00';
  v_state timestamptz := '2026-09-23 03:00:00+00';
  v_row record;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'publication_products',
    'publication_external_identifiers',
    'book_distribution_metadata',
    'publication_compliance_declarations'
  ]::text[]
  LOOP
    IF to_regclass('public.' || v_table) IS NULL THEN
      RAISE EXCEPTION 'convergence did not recreate table %', v_table;
    END IF;

    SELECT c.relrowsecurity
    INTO v_rls
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = v_table;

    IF v_rls IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'RLS disabled on %', v_table;
    END IF;
  END LOOP;

  -- Public catalog identity is readable, never writable.
  FOREACH v_table IN ARRAY ARRAY[
    'publication_products',
    'publication_external_identifiers'
  ]::text[]
  LOOP
    IF NOT has_table_privilege('anon', 'public.' || v_table, 'SELECT')
       OR NOT has_table_privilege('authenticated', 'public.' || v_table, 'SELECT') THEN
      RAISE EXCEPTION 'public identity table % is not readable as designed', v_table;
    END IF;

    IF has_table_privilege('anon', 'public.' || v_table, 'INSERT')
       OR has_table_privilege('anon', 'public.' || v_table, 'UPDATE')
       OR has_table_privilege('anon', 'public.' || v_table, 'DELETE')
       OR has_table_privilege('authenticated', 'public.' || v_table, 'INSERT')
       OR has_table_privilege('authenticated', 'public.' || v_table, 'UPDATE')
       OR has_table_privilege('authenticated', 'public.' || v_table, 'DELETE') THEN
      RAISE EXCEPTION 'browser role can mutate public identity table %', v_table;
    END IF;
  END LOOP;

  -- Distribution/compliance declarations are owner-readable but server-written.
  FOREACH v_table IN ARRAY ARRAY[
    'book_distribution_metadata',
    'publication_compliance_declarations'
  ]::text[]
  LOOP
    IF has_table_privilege('anon', 'public.' || v_table, 'SELECT')
       OR has_table_privilege('anon', 'public.' || v_table, 'INSERT')
       OR has_table_privilege('anon', 'public.' || v_table, 'UPDATE')
       OR has_table_privilege('anon', 'public.' || v_table, 'DELETE') THEN
      RAISE EXCEPTION 'anon has unexpected privilege on %', v_table;
    END IF;

    IF NOT has_table_privilege('authenticated', 'public.' || v_table, 'SELECT')
       OR has_table_privilege('authenticated', 'public.' || v_table, 'INSERT')
       OR has_table_privilege('authenticated', 'public.' || v_table, 'UPDATE')
       OR has_table_privilege('authenticated', 'public.' || v_table, 'DELETE') THEN
      RAISE EXCEPTION 'authenticated privilege shape wrong on %', v_table;
    END IF;
  END LOOP;

  IF has_function_privilege(
       'anon',
       'public.materialize_scroll_publication_identity(uuid)'::regprocedure,
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.materialize_scroll_publication_identity(uuid)'::regprocedure,
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role',
       'public.materialize_scroll_publication_identity(uuid)'::regprocedure,
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'materialize_scroll_publication_identity ACL is wrong';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'works'
      AND column_name = 'scroll_work_id'
      AND is_nullable <> 'NO'
  ) OR EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'publications'
      AND column_name = 'scroll_edition_id'
      AND is_nullable <> 'NO'
  ) THEN
    RAISE EXCEPTION 'Scroll canonical identity columns are still nullable';
  END IF;

  SELECT count(*) INTO v_count
  FROM pg_catalog.pg_trigger t
  JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'publication_compliance_declarations'
    AND t.tgname = 'trg_preserve_publication_compliance_audit_facts'
    AND NOT t.tgisinternal
    AND t.tgenabled <> 'D';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'compliance audit-fact preservation trigger missing';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(
    'public.preserve_publication_compliance_audit_facts()'::regprocedure
  ) INTO v_def;

  IF pg_catalog.strpos(v_def, 'OLD.distribution_started_at') = 0
     OR pg_catalog.strpos(v_def, 'OLD.dnb_deposit_completed_at') = 0
     OR pg_catalog.strpos(v_def, 'OLD.state_deposit_completed_at') = 0 THEN
    RAISE EXCEPTION 'compliance audit-fact preservation function weakened';
  END IF;

  -- Behavioral preservation check.
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  )
  VALUES (
    v_user,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'compliance-convergence@example.test',
    'x',
    now(), now(), now(),
    '{}'::jsonb, '{}'::jsonb
  );

  INSERT INTO public.books(user_id, title, category, language)
  VALUES(v_user, 'Compliance Convergence Fixture', 'non_fiction', 'en')
  RETURNING id INTO v_book;

  INSERT INTO public.publication_compliance_declarations(
    book_id,
    owner_user_id,
    jurisdiction,
    product_form,
    language,
    edition_label,
    distribution_started_at,
    dnb_deposit_completed_at,
    state_deposit_completed_at
  )
  VALUES(
    v_book,
    v_user,
    'DE',
    'paperback',
    'en',
    'First edition',
    v_started,
    v_dnb,
    v_state
  );

  UPDATE public.publication_compliance_declarations
  SET distribution_started_at = NULL,
      dnb_deposit_completed_at = NULL,
      state_deposit_completed_at = NULL
  WHERE book_id = v_book
    AND jurisdiction = 'DE'
    AND product_form = 'paperback';

  SELECT
    distribution_started_at,
    dnb_deposit_completed_at,
    state_deposit_completed_at
  INTO STRICT v_row
  FROM public.publication_compliance_declarations
  WHERE book_id = v_book
    AND jurisdiction = 'DE'
    AND product_form = 'paperback';

  IF v_row.distribution_started_at IS DISTINCT FROM v_started
     OR v_row.dnb_deposit_completed_at IS DISTINCT FROM v_dnb
     OR v_row.state_deposit_completed_at IS DISTINCT FROM v_state THEN
    RAISE EXCEPTION 'compliance audit facts were silently erased';
  END IF;

  -- Price metadata must not allow a half-specified commercial price.
  BEGIN
    INSERT INTO public.book_distribution_metadata(
      book_id, owner_user_id, product_form, price_cents
    )
    VALUES(v_book, v_user, 'paperback', 1999);
    RAISE EXCEPTION 'distribution price without price_type unexpectedly succeeded';
  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;
END
$$;

ROLLBACK;
