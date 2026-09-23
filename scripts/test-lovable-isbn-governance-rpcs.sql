\set ON_ERROR_STOP on

\ir ../drizzle/migrations/0010_converge_publishing_identity_p5_isbn_governance_rpcs.sql

DO $$
DECLARE
  v_signature text;
  v_def text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.submit_publishing_imprint_verification(uuid,uuid,text,text,text)',
    'public.review_publishing_imprint(uuid,uuid,boolean,text,text,text)',
    'public.submit_platform_isbn_pool_batch(uuid,uuid,text[],text)',
    'public.review_platform_isbn_pool_batch(uuid,uuid,boolean,text)',
    'public.submit_owned_isbn_claim(uuid,uuid,text,text)',
    'public.review_owned_isbn_claim(uuid,uuid,boolean,text)',
    'public.allocate_platform_isbn(uuid,uuid,text,text,text)',
    'public.assign_owned_isbn(uuid,uuid,text,text,text,text)'
  ]::text[]
  LOOP
    IF has_function_privilege('anon', v_signature, 'EXECUTE')
       OR has_function_privilege('authenticated', v_signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'ISBN governance RPC exposed to browser role: %', v_signature;
    END IF;

    IF NOT has_function_privilege('service_role', v_signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'service_role missing ISBN governance RPC: %', v_signature;
    END IF;
  END LOOP;

  SELECT pg_catalog.pg_get_functiondef(
    'public.review_publishing_imprint(uuid,uuid,boolean,text,text,text)'::regprocedure
  ) INTO v_def;
  IF pg_catalog.strpos(v_def, 'IMPRINT_VERIFICATION_EVIDENCE_NOT_SUBMITTED') = 0
     OR pg_catalog.strpos(v_def, 'IMPRINT_VERIFICATION_EVIDENCE_MISMATCH') = 0 THEN
    RAISE EXCEPTION 'imprint review no longer binds approval to prior submitted evidence';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(
    'public.submit_platform_isbn_pool_batch(uuid,uuid,text[],text)'::regprocedure
  ) INTO v_def;
  IF pg_catalog.strpos(v_def, 'DUPLICATE_ISBN_IN_BATCH') = 0
     OR pg_catalog.strpos(v_def, 'ISBN_ALREADY_REGISTERED') = 0
     OR pg_catalog.strpos(v_def, 'provenance_status <> ''rejected''') = 0 THEN
    RAISE EXCEPTION 'platform ISBN batch submission weakened';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(
    'public.review_platform_isbn_pool_batch(uuid,uuid,boolean,text)'::regprocedure
  ) INTO v_def;
  IF pg_catalog.strpos(v_def, 'ISBN_POOL_BATCH_MEMBERSHIP_MISMATCH') = 0
     OR pg_catalog.strpos(v_def, 'ISBN_POOL_BATCH_STATE_INVALID') = 0
     OR pg_catalog.strpos(v_def, 'VERIFIED_PLATFORM_IMPRINT_REQUIRED') = 0 THEN
    RAISE EXCEPTION 'platform ISBN batch review no longer revalidates state';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(
    'public.submit_owned_isbn_claim(uuid,uuid,text,text)'::regprocedure
  ) INTO v_def;
  IF pg_catalog.strpos(v_def, 'submit_publishing_imprint_verification') = 0
     OR pg_catalog.strpos(v_def, 'BOOK_NOT_OWNED') = 0
     OR pg_catalog.strpos(v_def, 'ISBN_CLAIMED_BY_DIFFERENT_PUBLISHER') = 0 THEN
    RAISE EXCEPTION 'owned ISBN submission authorization/evidence contract weakened';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(
    'public.assign_owned_isbn(uuid,uuid,text,text,text,text)'::regprocedure
  ) INTO v_def;
  IF pg_catalog.strpos(v_def, 'ISBN_REGISTERED_TO_DIFFERENT_IMPRINT') = 0
     OR pg_catalog.strpos(v_def, 'ISBN_ASSIGNMENT_LOCKED_BY_PUBLICATION') = 0
     OR pg_catalog.strpos(v_def, 'provenance_status <> ''verified''') = 0 THEN
    RAISE EXCEPTION 'owned ISBN assignment provenance/locking contract weakened';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(
    'public.allocate_platform_isbn(uuid,uuid,text,text,text)'::regprocedure
  ) INTO v_def;
  IF pg_catalog.strpos(v_def, 'FOR UPDATE SKIP LOCKED') = 0
     OR pg_catalog.strpos(v_def, 'ISBN_POOL_EMPTY') = 0
     OR pg_catalog.strpos(v_def, 'provenance_status = ''verified''') = 0 THEN
    RAISE EXCEPTION 'platform ISBN allocation concurrency/provenance contract weakened';
  END IF;
END
$$;

SELECT 'Lovable ISBN governance RPC convergence: PASS' AS result;
