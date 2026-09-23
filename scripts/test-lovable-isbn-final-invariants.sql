\set ON_ERROR_STOP on

\ir ../drizzle/migrations/0008_converge_publishing_identity_p3_final_invariants.sql

DO $$
DECLARE
  v_trigger_count integer;
  v_def text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.tg_record_platform_isbn_batch_membership()'::regprocedure
  ) INTO v_def;

  IF pg_catalog.strpos(v_def, 'IF TG_OP = ''INSERT'' THEN') = 0
     OR pg_catalog.strpos(v_def, 'ELSIF OLD.provenance_batch_id IS DISTINCT FROM NEW.provenance_batch_id THEN') = 0 THEN
    RAISE EXCEPTION 'batch membership trigger is not using the final INSERT-safe branch structure';
  END IF;

  SELECT count(*) INTO v_trigger_count
  FROM pg_catalog.pg_trigger t
  JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'isbn_inventory'
    AND t.tgname = 'trg_record_platform_isbn_batch_membership'
    AND NOT t.tgisinternal
    AND t.tgenabled <> 'D';
  IF v_trigger_count <> 1 THEN
    RAISE EXCEPTION 'final platform ISBN batch membership trigger missing or disabled';
  END IF;

  SELECT count(*) INTO v_trigger_count
  FROM pg_catalog.pg_trigger t
  JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'platform_isbn_pool_verification_batch_items'
    AND t.tgname = 'trg_platform_isbn_batch_item_immutable'
    AND NOT t.tgisinternal
    AND t.tgenabled <> 'D';
  IF v_trigger_count <> 1 THEN
    RAISE EXCEPTION 'platform ISBN batch item immutability trigger missing or disabled';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(
    'public.tg_platform_isbn_batch_item_immutable()'::regprocedure
  ) INTO v_def;
  IF pg_catalog.strpos(v_def, 'ISBN_POOL_BATCH_ITEM_IMMUTABLE') = 0 THEN
    RAISE EXCEPTION 'platform ISBN batch item immutability guard weakened';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.publishing_imprint_verifications'::regclass
      AND conname = 'publishing_imprint_verifications_independent_reviewer_chk'
      AND convalidated
  ) THEN
    RAISE EXCEPTION 'publishing imprint independent-review constraint missing';
  END IF;

  SELECT count(*) INTO v_trigger_count
  FROM pg_catalog.pg_trigger t
  JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
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
  ) INTO v_def;
  IF pg_catalog.strpos(v_def, 'IMPRINT_REVIEWER_SEPARATION_REQUIRED') = 0
     OR pg_catalog.strpos(v_def, 'NEW.submitted_by := v_submitted_by') = 0 THEN
    RAISE EXCEPTION 'independent imprint review guard weakened';
  END IF;

  IF has_function_privilege(
       'anon',
       'public.tg_require_independent_imprint_verification_review()',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.tg_require_independent_imprint_verification_review()',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'independent review trigger exposed to browser role';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name IN (
        'platform_isbn_pool_verification_batches',
        'platform_isbn_pool_verification_batch_items'
      )
      AND grantee IN ('anon','authenticated')
      AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER','REFERENCES')
  ) THEN
    RAISE EXCEPTION 'browser role holds write/schema privilege on platform ISBN governance table';
  END IF;
END
$$;

SELECT 'Lovable ISBN final-invariants convergence delta: PASS' AS result;
