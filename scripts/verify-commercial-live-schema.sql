-- Read-only semantic verification for the Lovable-controlled ScrollLibrary database.
-- Run AFTER Lovable applies/deploys the canonical main migrations. This script
-- intentionally verifies live objects and privileges instead of trusting the
-- migration ledger alone.

DO $$
DECLARE
  v_evidence_def text;
  v_category_data_type text;
  v_category_udt text;
  sig text;
BEGIN
  -- Economic billing authority must physically exist.
  IF to_regclass('public.billing_usage_monthly') IS NULL THEN
    RAISE EXCEPTION 'billing_usage_monthly missing';
  END IF;
  IF to_regclass('public.billing_orders') IS NULL THEN
    RAISE EXCEPTION 'billing_orders missing';
  END IF;
  IF to_regclass('public.billing_order_refunds') IS NULL THEN
    RAISE EXCEPTION 'billing_order_refunds missing';
  END IF;

  FOREACH sig IN ARRAY ARRAY[
    'public.reserve_billing_usage(uuid,text,text,bigint,bigint)',
    'public.release_billing_usage(uuid,text,text,bigint)',
    'public.grant_billing_usage_addon(uuid,text,text,bigint)',
    'public.settle_billing_order(uuid,text,text,text)',
    'public.fail_billing_order(uuid,text)',
    'public.record_billing_order_refund(uuid,text,integer)'
  ] LOOP
    IF to_regprocedure(sig) IS NULL THEN
      RAISE EXCEPTION 'billing authority function missing: %', sig;
    END IF;
    IF has_function_privilege('anon', sig, 'EXECUTE')
       OR has_function_privilege('authenticated', sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'browser role can execute server billing RPC: %', sig;
    END IF;
    IF NOT has_function_privilege('service_role', sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'service_role cannot execute billing RPC: %', sig;
    END IF;
  END LOOP;

  IF to_regprocedure('public.get_my_billing_usage_snapshot()') IS NULL THEN
    RAISE EXCEPTION 'get_my_billing_usage_snapshot missing';
  END IF;
  IF has_function_privilege('anon','public.get_my_billing_usage_snapshot()','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.get_my_billing_usage_snapshot()','EXECUTE') THEN
    RAISE EXCEPTION 'billing usage snapshot browser privileges are wrong';
  END IF;

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

  FOREACH sig IN ARRAY ARRAY[
    'public.creator_payout_entry_is_eligible(public.creator_earnings_ledger)',
    'public.get_creator_payout_balance(uuid)',
    'public.list_creator_payout_candidates(integer,integer)',
    'public.reserve_creator_payout(uuid,text,integer)',
    'public.mark_creator_payout_transferred(uuid,text)',
    'public.mark_creator_payout_failed(uuid,text,text)'
  ] LOOP
    IF has_function_privilege('anon', sig, 'EXECUTE')
       OR has_function_privilege('authenticated', sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'browser role can execute payout settlement RPC: %', sig;
    END IF;
  END LOOP;

  -- Internal SECURITY DEFINER maintenance RPCs must remain server-only.
  FOREACH sig IN ARRAY ARRAY[
    'public._phase1_backfill_works()',
    'public.consume_rate_limit(text,text,integer,integer)',
    'public.ensure_individual_rights_holder(uuid,text)',
    'public.get_effective_user_tier(uuid)',
    'public.get_user_asset_entitlements(uuid)',
    'public.get_user_recommendation_suppression(uuid,integer)',
    'public.notify_followers_on_schedule_release(uuid)',
    'public.purge_velocity_buckets()',
    'public.record_asset_purchase_ledger(uuid)',
    'public.reserve_book_generation(uuid,date,integer,integer)',
    'public.release_book_generation(uuid,date,integer)',
    'public.snapshot_creator_entitlement(uuid,text,uuid)',
    'public.snapshot_creator_entitlement(uuid,text,text,jsonb)',
    'public.sweep_stale_jobs(integer,integer)'
  ] LOOP
    IF to_regprocedure(sig) IS NULL THEN
      RAISE EXCEPTION 'internal RPC missing: %', sig;
    END IF;
    IF has_function_privilege('anon', sig, 'EXECUTE')
       OR has_function_privilege('authenticated', sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'browser role can execute internal SECURITY DEFINER RPC: %', sig;
    END IF;
    IF NOT has_function_privilege('service_role', sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'service_role cannot execute internal RPC: %', sig;
    END IF;
  END LOOP;

  IF has_function_privilege('anon','public.log_audit_event(text,uuid,uuid,text,text,text,jsonb)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.log_audit_event(text,uuid,uuid,text,text,text,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'log_audit_event privilege contract is wrong';
  END IF;
  IF has_function_privilege('anon','public.set_platform_fee(integer)','EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute set_platform_fee';
  END IF;

  -- Publishing certificates are immutable evidence from the browser's point of
  -- view. Issuance/revocation belongs to trusted server workflows only.
  IF to_regclass('public.publishing_certificates') IS NULL THEN
    RAISE EXCEPTION 'publishing_certificates missing';
  END IF;
  IF has_table_privilege('anon','public.publishing_certificates','INSERT')
     OR has_table_privilege('anon','public.publishing_certificates','UPDATE')
     OR has_table_privilege('anon','public.publishing_certificates','DELETE')
     OR has_table_privilege('authenticated','public.publishing_certificates','INSERT')
     OR has_table_privilege('authenticated','public.publishing_certificates','UPDATE')
     OR has_table_privilege('authenticated','public.publishing_certificates','DELETE') THEN
    RAISE EXCEPTION 'browser role can mutate publishing_certificates';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname='public'
      AND tablename='publishing_certificates'
      AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
      AND roles && ARRAY['public'::name,'anon'::name,'authenticated'::name]
  ) THEN
    RAISE EXCEPTION 'browser/public publishing certificate write policy remains';
  END IF;
  IF NOT has_table_privilege('service_role','public.publishing_certificates','INSERT')
     OR NOT has_table_privilege('service_role','public.publishing_certificates','UPDATE')
     OR NOT has_table_privilege('service_role','public.publishing_certificates','DELETE') THEN
    RAISE EXCEPTION 'service_role lacks publishing certificate mutation authority';
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
