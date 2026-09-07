\set ON_ERROR_STOP on

DO $$
DECLARE
  v_trigger_count integer;
  v_guard_def text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'publishing_imprint_verifications'
      AND column_name = 'submitted_by'
  ) THEN
    RAISE EXCEPTION 'publishing imprint review audit is missing submitted_by';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.publishing_imprint_verifications'::regclass
      AND conname = 'publishing_imprint_verifications_independent_reviewer_chk'
      AND convalidated
  ) THEN
    RAISE EXCEPTION 'publishing imprint independent-review constraint missing or unvalidated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.isbn_claim_requests'::regclass
      AND conname = 'isbn_claim_requests_independent_reviewer_chk'
      AND convalidated
  ) THEN
    RAISE EXCEPTION 'author ISBN claim independent-review constraint missing or unvalidated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.platform_isbn_pool_verification_batches'::regclass
      AND conname = 'platform_isbn_pool_batches_independent_reviewer_chk'
      AND convalidated
  ) THEN
    RAISE EXCEPTION 'platform ISBN pool independent-review constraint missing or unvalidated';
  END IF;

  SELECT count(*) INTO v_trigger_count
  FROM pg_catalog.pg_trigger AS t
  JOIN pg_catalog.pg_class AS c ON c.oid = t.tgrelid
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'publishing_imprint_verifications'
    AND t.tgname = 'trg_require_independent_imprint_verification_review'
    AND NOT t.tgisinternal
    AND t.tgenabled <> 'D';

  IF v_trigger_count <> 1 THEN
    RAISE EXCEPTION 'publishing imprint independent-review trigger missing or disabled';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(
    'public.tg_require_independent_imprint_verification_review()'::regprocedure
  ) INTO v_guard_def;

  IF pg_catalog.strpos(v_guard_def, 'IMPRINT_REVIEWER_SEPARATION_REQUIRED') = 0
     OR pg_catalog.strpos(v_guard_def, 'NEW.submitted_by := v_submitted_by') = 0
     OR pg_catalog.strpos(v_guard_def, 'verification_submitted_by') = 0 THEN
    RAISE EXCEPTION 'publishing imprint reviewer guard no longer enforces independent, auditable review';
  END IF;

  -- The review records/functions are security-sensitive and must remain
  -- unavailable to browser roles.
  IF has_function_privilege(
       'anon',
       'public.tg_require_independent_imprint_verification_review()',
       'EXECUTE'
     ) OR has_function_privilege(
       'authenticated',
       'public.tg_require_independent_imprint_verification_review()',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'independent-review trigger function exposed to client roles';
  END IF;
END;
$$;
