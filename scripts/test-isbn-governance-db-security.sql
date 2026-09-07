\set ON_ERROR_STOP on

DO $$
DECLARE
  v_rls boolean;
  v_trigger_count integer;
  v_review_def text;
  v_submit_pool_def text;
BEGIN
  -- Imprint verification must expose an explicit pending-evidence state.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'publishing_imprints'
      AND column_name = 'verification_pending_reference'
  ) THEN
    RAISE EXCEPTION 'missing publishing_imprints.verification_pending_reference';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'publishing_imprints'
      AND column_name = 'verification_submitted_at'
  ) THEN
    RAISE EXCEPTION 'missing publishing_imprints.verification_submitted_at';
  END IF;

  -- Pool evidence must be auditable separately from inventory rows.
  SELECT c.relrowsecurity INTO v_rls
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'platform_isbn_pool_verification_batches';
  IF v_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'platform_isbn_pool_verification_batches must have RLS enabled';
  END IF;

  -- Sensitive governance RPCs are service-role-only.
  IF has_function_privilege('anon', 'public.submit_publishing_imprint_verification(uuid,uuid,text,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.submit_publishing_imprint_verification(uuid,uuid,text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'imprint evidence submission RPC exposed to client roles';
  END IF;
  IF has_function_privilege('anon', 'public.review_publishing_imprint(uuid,uuid,boolean,text,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.review_publishing_imprint(uuid,uuid,boolean,text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'imprint review RPC exposed to client roles';
  END IF;
  IF has_function_privilege('anon', 'public.submit_platform_isbn_pool_batch(uuid,uuid,text[],text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.submit_platform_isbn_pool_batch(uuid,uuid,text[],text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'platform pool evidence RPC exposed to client roles';
  END IF;
  IF has_function_privilege('anon', 'public.review_platform_isbn_pool_batch(uuid,uuid,boolean,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.review_platform_isbn_pool_batch(uuid,uuid,boolean,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'platform pool review RPC exposed to client roles';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.submit_publishing_imprint_verification(uuid,uuid,text,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.review_publishing_imprint(uuid,uuid,boolean,text,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.submit_platform_isbn_pool_batch(uuid,uuid,text[],text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.review_platform_isbn_pool_batch(uuid,uuid,boolean,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role missing ISBN governance RPC privilege';
  END IF;

  -- Review cannot act as evidence submission: the function itself must enforce
  -- a pre-existing pending record and exact evidence matching.
  SELECT pg_catalog.pg_get_functiondef(
    'public.review_publishing_imprint(uuid,uuid,boolean,text,text,text)'::regprocedure
  ) INTO v_review_def;
  IF pg_catalog.position('IMPRINT_VERIFICATION_EVIDENCE_NOT_SUBMITTED' IN v_review_def) = 0
     OR pg_catalog.position('IMPRINT_VERIFICATION_EVIDENCE_MISMATCH' IN v_review_def) = 0 THEN
    RAISE EXCEPTION 'imprint review no longer enforces separate evidence submission';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(
    'public.submit_platform_isbn_pool_batch(uuid,uuid,text[],text)'::regprocedure
  ) INTO v_submit_pool_def;
  IF pg_catalog.position('provenance_status = ''unverified''' IN v_submit_pool_def) = 0
     AND pg_catalog.position('''unverified''' IN v_submit_pool_def) = 0 THEN
    RAISE EXCEPTION 'platform pool submission no longer creates pending/unverified provenance';
  END IF;

  -- Verified publication minting must finalize in the INSERT transaction.
  SELECT count(*) INTO v_trigger_count
  FROM pg_catalog.pg_trigger t
  JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'publications'
    AND t.tgname = 'trg_finalize_verified_publication_insert'
    AND NOT t.tgisinternal
    AND t.tgenabled <> 'D';
  IF v_trigger_count <> 1 THEN
    RAISE EXCEPTION 'verified Publication atomic-finalization trigger missing or disabled';
  END IF;
END
$$;

SELECT 'ISBN governance database contract: PASS' AS result;
