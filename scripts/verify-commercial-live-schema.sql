-- Read-only semantic verification for the Lovable-controlled ScrollLibrary database.
-- Run AFTER Lovable applies/deploys the canonical main migrations. This script
-- intentionally verifies live objects and privileges instead of trusting the
-- migration ledger alone.

DO $$
DECLARE
  v_evidence_def text;
  v_category_data_type text;
  v_category_udt text;
BEGIN
  -- Creator payout settlement must physically exist.
  IF to_regclass('public.creator_payout_transfers') IS NULL THEN
    RAISE EXCEPTION 'creator_payout_transfers missing';
  END IF;
  IF to_regclass('public.creator_payout_allocations') IS NULL THEN
    RAISE EXCEPTION 'creator_payout_allocations missing';
  END IF;

  IF to_regprocedure('public.creator_payout_entry_is_eligible(public.creator_earnings_ledger)') IS NULL THEN
    RAISE EXCEPTION 'creator_payout_entry_is_eligible missing';
  END IF;
  IF to_regprocedure('public.get_creator_payout_balance(uuid)') IS NULL THEN
    RAISE EXCEPTION 'get_creator_payout_balance missing';
  END IF;
  IF to_regprocedure('public.list_creator_payout_candidates(integer,integer)') IS NULL THEN
    RAISE EXCEPTION 'list_creator_payout_candidates missing';
  END IF;
  IF to_regprocedure('public.reserve_creator_payout(uuid,text,integer)') IS NULL THEN
    RAISE EXCEPTION 'reserve_creator_payout missing';
  END IF;
  IF to_regprocedure('public.mark_creator_payout_transferred(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'mark_creator_payout_transferred missing';
  END IF;
  IF to_regprocedure('public.mark_creator_payout_failed(uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'mark_creator_payout_failed missing';
  END IF;

  IF has_table_privilege('authenticated','public.creator_payout_transfers','SELECT')
     OR has_table_privilege('authenticated','public.creator_payout_allocations','SELECT') THEN
    RAISE EXCEPTION 'authenticated role can directly read payout settlement tables';
  END IF;

  -- Every settlement RPC is server-owned. Read-looking SECURITY DEFINER functions
  -- are included deliberately: get_creator_payout_balance(uuid) accepts an arbitrary
  -- creator UUID, so a future default PUBLIC EXECUTE grant would leak financial totals.
  IF has_function_privilege('authenticated','public.creator_payout_entry_is_eligible(public.creator_earnings_ledger)','EXECUTE')
     OR has_function_privilege('authenticated','public.get_creator_payout_balance(uuid)','EXECUTE')
     OR has_function_privilege('authenticated','public.list_creator_payout_candidates(integer,integer)','EXECUTE')
     OR has_function_privilege('authenticated','public.reserve_creator_payout(uuid,text,integer)','EXECUTE')
     OR has_function_privilege('authenticated','public.mark_creator_payout_transferred(uuid,text)','EXECUTE')
     OR has_function_privilege('authenticated','public.mark_creator_payout_failed(uuid,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'authenticated role can execute payout settlement RPCs';
  END IF;

  -- Public read is allowed for study music; all writes must remain server-owned.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname='storage'
      AND tablename='objects'
      AND policyname='Service role can upload study music'
      AND cmd='INSERT'
      AND roles = ARRAY['service_role'::name]
      AND COALESCE(with_check,'') ILIKE '%study-music%'
  ) THEN
    RAISE EXCEPTION 'service-role-only study-music INSERT policy missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname='storage'
      AND tablename='objects'
      AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
      AND roles && ARRAY['public'::name,'anon'::name,'authenticated'::name]
      AND (COALESCE(qual,'') ILIKE '%study-music%'
           OR COALESCE(with_check,'') ILIKE '%study-music%')
  ) THEN
    RAISE EXCEPTION 'study-music has a browser/public write policy';
  END IF;

  -- Live category storage may legitimately be text or the canonical enum.
  SELECT data_type, udt_name
    INTO v_category_data_type, v_category_udt
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='books' AND column_name='category';

  IF v_category_data_type IS NULL THEN
    RAISE EXCEPTION 'books.category missing';
  END IF;
  IF NOT (v_category_data_type='text' OR v_category_udt='book_category') THEN
    RAISE EXCEPTION 'unsupported books.category type: %/%', v_category_data_type, v_category_udt;
  END IF;

  SELECT pg_get_functiondef(p.oid)
    INTO v_evidence_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname='book_requires_publication_evidence'
    AND pg_get_function_identity_arguments(p.oid)='p_book_id uuid';

  IF v_evidence_def IS NULL THEN
    RAISE EXCEPTION 'book_requires_publication_evidence(uuid) missing';
  END IF;
  IF position('health' in lower(v_evidence_def)) = 0
     OR position('psychology' in lower(v_evidence_def)) = 0
     OR position('business' in lower(v_evidence_def)) = 0
     OR position('minimum wage' in lower(v_evidence_def)) = 0
     OR position('funding round' in lower(v_evidence_def)) = 0 THEN
    RAISE EXCEPTION 'publication evidence function is stale or incomplete';
  END IF;

  RAISE NOTICE 'COMMERCIAL LIVE SCHEMA ASSERTIONS PASSED';
END
$$;
