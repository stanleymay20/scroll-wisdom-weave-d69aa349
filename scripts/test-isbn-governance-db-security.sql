\set ON_ERROR_STOP on

DO $$
DECLARE
  v_rls boolean;
  v_trigger_count integer;
  v_review_def text;
  v_submit_pool_def text;
  v_review_pool_def text;
  v_submit_owned_def text;
  v_drift_def text;
  v_mint_def text;
  v_work_id uuid := gen_random_uuid();
  v_book_id uuid := gen_random_uuid();
  v_key_a text;
  v_key_b text;
  v_key_changed text;
  v_snapshot_a jsonb := jsonb_build_object(
    'scroll_edition_id', 'SLE-RETRY-A',
    'frozen_at', '2026-09-07T10:00:00Z',
    'title', 'Retry identity fixture',
    'publication_trust', jsonb_build_object('scope_hash', repeat('a', 64))
  );
  v_snapshot_b jsonb := jsonb_build_object(
    'scroll_edition_id', 'SLE-RETRY-B',
    'frozen_at', '2026-09-07T10:00:01Z',
    'title', 'Retry identity fixture',
    'publication_trust', jsonb_build_object('scope_hash', repeat('a', 64))
  );
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

  -- Retry identity is a first-class, uniquely indexed Publication attribute.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'publications'
      AND column_name = 'release_request_key'
  ) THEN
    RAISE EXCEPTION 'missing publications.release_request_key';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'publications'
      AND indexname = 'publications_release_request_key_uq'
      AND indexdef ILIKE 'CREATE UNIQUE INDEX%'
  ) THEN
    RAISE EXCEPTION 'publication release-request uniqueness index missing';
  END IF;

  -- Sensitive governance/mint RPCs are service-role-only.
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
  IF has_function_privilege(
       'anon',
       'public.mint_verified_publication_release(uuid,uuid,uuid,text,public.publication_edition_kind,text,jsonb,jsonb,text,text)',
       'EXECUTE'
     ) OR has_function_privilege(
       'authenticated',
       'public.mint_verified_publication_release(uuid,uuid,uuid,text,public.publication_edition_kind,text,jsonb,jsonb,text,text)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'verified Publication mint RPC exposed to client roles';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.submit_publishing_imprint_verification(uuid,uuid,text,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.review_publishing_imprint(uuid,uuid,boolean,text,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.submit_platform_isbn_pool_batch(uuid,uuid,text[],text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.review_platform_isbn_pool_batch(uuid,uuid,boolean,text)', 'EXECUTE')
     OR NOT has_function_privilege(
       'service_role',
       'public.mint_verified_publication_release(uuid,uuid,uuid,text,public.publication_edition_kind,text,jsonb,jsonb,text,text)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'service_role missing ISBN governance/mint RPC privilege';
  END IF;

  -- Review cannot act as evidence submission: the function itself must enforce
  -- a pre-existing pending record and exact evidence matching.
  SELECT pg_catalog.pg_get_functiondef(
    'public.review_publishing_imprint(uuid,uuid,boolean,text,text,text)'::regprocedure
  ) INTO v_review_def;
  IF pg_catalog.strpos(v_review_def, 'IMPRINT_VERIFICATION_EVIDENCE_NOT_SUBMITTED') = 0
     OR pg_catalog.strpos(v_review_def, 'IMPRINT_VERIFICATION_EVIDENCE_MISMATCH') = 0 THEN
    RAISE EXCEPTION 'imprint review no longer enforces separate evidence submission';
  END IF;

  -- Platform pool submission must remain pending, reject duplicate input and
  -- refuse silent re-verification of an already registered ISBN.
  SELECT pg_catalog.pg_get_functiondef(
    'public.submit_platform_isbn_pool_batch(uuid,uuid,text[],text)'::regprocedure
  ) INTO v_submit_pool_def;
  IF pg_catalog.strpos(v_submit_pool_def, '''unverified''') = 0
     OR pg_catalog.strpos(v_submit_pool_def, 'DUPLICATE_ISBN_IN_BATCH') = 0
     OR pg_catalog.strpos(v_submit_pool_def, 'ISBN_ALREADY_REGISTERED') = 0
     OR pg_catalog.strpos(v_submit_pool_def, 'provenance_status <> ''rejected''') = 0 THEN
    RAISE EXCEPTION 'platform pool submission no longer enforces isolated pending evidence';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(
    'public.review_platform_isbn_pool_batch(uuid,uuid,boolean,text)'::regprocedure
  ) INTO v_review_pool_def;
  IF pg_catalog.strpos(v_review_pool_def, 'ISBN_POOL_BATCH_MEMBERSHIP_MISMATCH') = 0
     OR pg_catalog.strpos(v_review_pool_def, 'ISBN_POOL_BATCH_STATE_INVALID') = 0
     OR pg_catalog.strpos(v_review_pool_def, 'VERIFIED_PLATFORM_IMPRINT_REQUIRED') = 0 THEN
    RAISE EXCEPTION 'platform pool review no longer re-validates batch/imprint state';
  END IF;

  -- Author-owned ISBN submission must create pending imprint evidence when the
  -- user imprint has not yet been independently verified. This preserves the
  -- existing user workflow without conflating submission with approval.
  SELECT pg_catalog.pg_get_functiondef(
    'public.submit_owned_isbn_claim(uuid,uuid,text,text)'::regprocedure
  ) INTO v_submit_owned_def;
  IF pg_catalog.strpos(v_submit_owned_def, 'submit_publishing_imprint_verification') = 0
     OR pg_catalog.strpos(v_submit_owned_def, 'v_imprint.verified IS NOT TRUE') = 0 THEN
    RAISE EXCEPTION 'author-owned ISBN claim no longer submits pending imprint evidence';
  END IF;

  -- Publisher/registrant facts cannot mutate underneath attached ISBN inventory.
  SELECT pg_catalog.pg_get_functiondef('public.prevent_imprint_identity_drift()'::regprocedure)
  INTO v_drift_def;
  IF pg_catalog.strpos(v_drift_def, 'country_code') = 0
     OR pg_catalog.strpos(v_drift_def, 'isbn_agency_name') = 0
     OR pg_catalog.strpos(v_drift_def, 'registrant_name') = 0
     OR pg_catalog.strpos(v_drift_def, 'IMPRINT_IDENTITY_LOCKED') = 0 THEN
    RAISE EXCEPTION 'imprint identity drift guard does not cover verified registrant facts';
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

  SELECT count(*) INTO v_trigger_count
  FROM pg_catalog.pg_trigger t
  JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'publications'
    AND t.tgname = 'trg_set_publication_release_request_key'
    AND NOT t.tgisinternal
    AND t.tgenabled <> 'D';
  IF v_trigger_count <> 1 THEN
    RAISE EXCEPTION 'Publication release-request key trigger missing or disabled';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(
    'public.mint_verified_publication_release(uuid,uuid,uuid,text,public.publication_edition_kind,text,jsonb,jsonb,text,text)'::regprocedure
  ) INTO v_mint_def;
  IF pg_catalog.strpos(v_mint_def, 'FOR UPDATE') = 0
     OR pg_catalog.strpos(v_mint_def, 'release_request_key') = 0
     OR pg_catalog.strpos(v_mint_def, 'compute_book_publication_hash') = 0
     OR pg_catalog.strpos(v_mint_def, 'finalize_publication_release') = 0 THEN
    RAISE EXCEPTION 'verified Publication mint no longer serializes/revalidates/finalizes atomically';
  END IF;

  -- Retry identity deliberately ignores only per-attempt volatile values.
  v_key_a := public.compute_publication_release_request_key(
    v_work_id, v_book_id, 'original'::public.publication_edition_kind, 'en', v_snapshot_a
  );
  v_key_b := public.compute_publication_release_request_key(
    v_work_id, v_book_id, 'original'::public.publication_edition_kind, 'en', v_snapshot_b
  );
  IF v_key_a IS DISTINCT FROM v_key_b THEN
    RAISE EXCEPTION 'retry key changed across volatile scroll edition/freeze timestamp';
  END IF;

  v_key_changed := public.compute_publication_release_request_key(
    v_work_id,
    v_book_id,
    'original'::public.publication_edition_kind,
    'en',
    pg_catalog.jsonb_set(v_snapshot_b, '{title}', '"Changed publishing state"'::jsonb)
  );
  IF v_key_a IS NOT DISTINCT FROM v_key_changed THEN
    RAISE EXCEPTION 'retry key failed to change for material frozen publishing state';
  END IF;
END
$$;

SELECT 'ISBN governance database contract: PASS' AS result;
