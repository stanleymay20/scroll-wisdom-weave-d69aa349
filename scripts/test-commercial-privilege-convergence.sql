\set ON_ERROR_STOP on
-- Disposable CI database only. No hosted connection or production execution.
-- All simulated drift, permission repairs and role calls are rolled back.
BEGIN;

CREATE TEMP TABLE acl_function_bodies AS
SELECT oid, pg_get_functiondef(oid) AS definition FROM pg_proc
WHERE oid IN (
    'public.reserve_billing_usage(uuid,text,text,bigint,bigint)'::regprocedure,
    'public.release_billing_usage(uuid,text,text,bigint)'::regprocedure,
    'public.grant_billing_usage_addon(uuid,text,text,bigint)'::regprocedure,
    'public.settle_billing_order(uuid,text,text,text)'::regprocedure,
    'public.fail_billing_order(uuid,text)'::regprocedure,
    'public.record_billing_order_refund(uuid,text,integer)'::regprocedure,
    'public.creator_payout_entry_is_eligible(public.creator_earnings_ledger)'::regprocedure,
    'public.get_creator_payout_balance(uuid)'::regprocedure,
    'public.list_creator_payout_candidates(integer,integer)'::regprocedure,
    'public.reserve_creator_payout(uuid,text,integer)'::regprocedure,
    'public.mark_creator_payout_transferred(uuid,text)'::regprocedure,
    'public.mark_creator_payout_failed(uuid,text,text)'::regprocedure,
    'public.get_user_marketplace_fee_bps(uuid)'::regprocedure,
    'public.get_my_billing_usage_snapshot()'::regprocedure
);
CREATE TEMP TABLE acl_policy_baseline AS SELECT * FROM pg_policy;
-- Reproduce the catalog grants observed on the shared hosted database.
GRANT EXECUTE ON FUNCTION public.reserve_billing_usage(uuid,text,text,bigint,bigint) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_billing_usage(uuid,text,text,bigint) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_billing_usage_addon(uuid,text,text,bigint) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_billing_order(uuid,text,text,text) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_billing_order(uuid,text) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_billing_order_refund(uuid,text,integer) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.creator_payout_entry_is_eligible(public.creator_earnings_ledger) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_creator_payout_balance(uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_creator_payout_candidates(integer,integer) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_creator_payout(uuid,text,integer) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_creator_payout_transferred(uuid,text) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_creator_payout_failed(uuid,text,text) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_marketplace_fee_bps(uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_billing_usage_snapshot() TO PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.billing_usage_monthly TO anon, authenticated;
GRANT ALL ON TABLE public.billing_orders TO anon, authenticated;
GRANT ALL ON TABLE public.billing_order_refunds TO anon, authenticated;
GRANT ALL ON TABLE public.creator_payout_transfers TO anon, authenticated;
GRANT ALL ON TABLE public.creator_payout_allocations TO anon, authenticated;

DO $$
DECLARE sig text;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public.reserve_billing_usage(uuid,text,text,bigint,bigint)',
    'public.release_billing_usage(uuid,text,text,bigint)',
    'public.grant_billing_usage_addon(uuid,text,text,bigint)',
    'public.settle_billing_order(uuid,text,text,text)',
    'public.fail_billing_order(uuid,text)',
    'public.record_billing_order_refund(uuid,text,integer)',
    'public.creator_payout_entry_is_eligible(public.creator_earnings_ledger)',
    'public.get_creator_payout_balance(uuid)',
    'public.list_creator_payout_candidates(integer,integer)',
    'public.reserve_creator_payout(uuid,text,integer)',
    'public.mark_creator_payout_transferred(uuid,text)',
    'public.mark_creator_payout_failed(uuid,text,text)',
    'public.get_user_marketplace_fee_bps(uuid)'
  ] LOOP
    IF NOT has_function_privilege('anon', sig, 'EXECUTE')
       OR NOT has_function_privilege('authenticated', sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'drift fixture was not installed: %', sig;
    END IF;
  END LOOP;
END $$;

-- Exact privilege-only correction; no migration replay or pricing changes.
REVOKE ALL ON FUNCTION public.reserve_billing_usage(uuid,text,text,bigint,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_billing_usage(uuid,text,text,bigint,bigint) TO service_role;
REVOKE ALL ON FUNCTION public.release_billing_usage(uuid,text,text,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_billing_usage(uuid,text,text,bigint) TO service_role;
REVOKE ALL ON FUNCTION public.grant_billing_usage_addon(uuid,text,text,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_billing_usage_addon(uuid,text,text,bigint) TO service_role;
REVOKE ALL ON FUNCTION public.settle_billing_order(uuid,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_billing_order(uuid,text,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.fail_billing_order(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_billing_order(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.record_billing_order_refund(uuid,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_billing_order_refund(uuid,text,integer) TO service_role;
REVOKE ALL ON FUNCTION public.creator_payout_entry_is_eligible(public.creator_earnings_ledger) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.creator_payout_entry_is_eligible(public.creator_earnings_ledger) TO service_role;
REVOKE ALL ON FUNCTION public.get_creator_payout_balance(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_creator_payout_balance(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.list_creator_payout_candidates(integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_creator_payout_candidates(integer,integer) TO service_role;
REVOKE ALL ON FUNCTION public.reserve_creator_payout(uuid,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_creator_payout(uuid,text,integer) TO service_role;
REVOKE ALL ON FUNCTION public.mark_creator_payout_transferred(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_creator_payout_transferred(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.mark_creator_payout_failed(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_creator_payout_failed(uuid,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.get_user_marketplace_fee_bps(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_marketplace_fee_bps(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.get_my_billing_usage_snapshot() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_billing_usage_snapshot() TO authenticated, service_role;
REVOKE ALL ON TABLE public.billing_usage_monthly FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.billing_usage_monthly TO service_role;
REVOKE ALL ON TABLE public.billing_orders FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.billing_orders TO service_role;
REVOKE ALL ON TABLE public.billing_order_refunds FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.billing_order_refunds TO service_role;
REVOKE ALL ON TABLE public.creator_payout_transfers FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.creator_payout_transfers TO service_role;
REVOKE ALL ON TABLE public.creator_payout_allocations FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.creator_payout_allocations TO service_role;
GRANT SELECT ON TABLE public.billing_usage_monthly, public.billing_orders TO authenticated;

DO $$
DECLARE sig text; tbl text; privilege text; role_name text;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public.reserve_billing_usage(uuid,text,text,bigint,bigint)',
    'public.release_billing_usage(uuid,text,text,bigint)',
    'public.grant_billing_usage_addon(uuid,text,text,bigint)',
    'public.settle_billing_order(uuid,text,text,text)',
    'public.fail_billing_order(uuid,text)',
    'public.record_billing_order_refund(uuid,text,integer)',
    'public.creator_payout_entry_is_eligible(public.creator_earnings_ledger)',
    'public.get_creator_payout_balance(uuid)',
    'public.list_creator_payout_candidates(integer,integer)',
    'public.reserve_creator_payout(uuid,text,integer)',
    'public.mark_creator_payout_transferred(uuid,text)',
    'public.mark_creator_payout_failed(uuid,text,text)',
    'public.get_user_marketplace_fee_bps(uuid)'
  ] LOOP
    IF has_function_privilege('anon', sig, 'EXECUTE')
       OR has_function_privilege('authenticated', sig, 'EXECUTE')
       OR NOT has_function_privilege('service_role', sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'incorrect repaired RPC grant: %', sig;
    END IF;
  END LOOP;
  FOREACH tbl IN ARRAY ARRAY['public.billing_usage_monthly','public.billing_orders','public.billing_order_refunds','public.creator_payout_transfers','public.creator_payout_allocations'] LOOP
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
      FOREACH privilege IN ARRAY ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
        IF has_table_privilege(role_name, tbl, privilege) THEN
          RAISE EXCEPTION 'browser retains % on % for %', privilege, tbl, role_name;
        END IF;
      END LOOP;
      IF has_table_privilege(role_name, tbl, 'SELECT')
         IS DISTINCT FROM (role_name='authenticated' AND tbl IN ('public.billing_usage_monthly','public.billing_orders')) THEN
        RAISE EXCEPTION 'incorrect browser read grant: %/%', role_name, tbl;
      END IF;
    END LOOP;
    FOREACH privilege IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
      IF NOT has_table_privilege('service_role', tbl, privilege) THEN
        RAISE EXCEPTION 'service role lost % on %', privilege, tbl;
      END IF;
    END LOOP;
  END LOOP;
  IF EXISTS (SELECT 1 FROM acl_function_bodies b WHERE b.definition IS DISTINCT FROM pg_get_functiondef(b.oid))
     OR EXISTS ((SELECT * FROM pg_policy EXCEPT SELECT * FROM acl_policy_baseline)
                UNION ALL (SELECT * FROM acl_policy_baseline EXCEPT SELECT * FROM pg_policy)) THEN
    RAISE EXCEPTION 'permission repair altered a function body or RLS policy';
  END IF;
END $$;

SET LOCAL ROLE anon;
DO $$
DECLARE call_sql text;
BEGIN
  FOREACH call_sql IN ARRAY ARRAY[
    'SELECT public.reserve_billing_usage(NULL::uuid,NULL::text,NULL::text,NULL::bigint,NULL::bigint)',
    'SELECT public.release_billing_usage(NULL::uuid,NULL::text,NULL::text,NULL::bigint)',
    'SELECT public.grant_billing_usage_addon(NULL::uuid,NULL::text,NULL::text,NULL::bigint)',
    'SELECT public.settle_billing_order(NULL::uuid,NULL::text,NULL::text,NULL::text)',
    'SELECT public.fail_billing_order(NULL::uuid,NULL::text)',
    'SELECT public.record_billing_order_refund(NULL::uuid,NULL::text,NULL::integer)',
    'SELECT public.creator_payout_entry_is_eligible(NULL::public.creator_earnings_ledger)',
    'SELECT public.get_creator_payout_balance(NULL::uuid)',
    'SELECT public.list_creator_payout_candidates(NULL::integer,NULL::integer)',
    'SELECT public.reserve_creator_payout(NULL::uuid,NULL::text,NULL::integer)',
    'SELECT public.mark_creator_payout_transferred(NULL::uuid,NULL::text)',
    'SELECT public.mark_creator_payout_failed(NULL::uuid,NULL::text,NULL::text)',
    'SELECT public.get_user_marketplace_fee_bps(NULL::uuid)'
  ] LOOP
    BEGIN
      EXECUTE call_sql;
      RAISE EXCEPTION 'browser invocation unexpectedly succeeded: %', call_sql;
    EXCEPTION WHEN insufficient_privilege THEN
      NULL;
    END;
  END LOOP;
END $$;
RESET ROLE;

SET LOCAL ROLE authenticated;
DO $$
DECLARE call_sql text;
BEGIN
  FOREACH call_sql IN ARRAY ARRAY[
    'SELECT public.reserve_billing_usage(NULL::uuid,NULL::text,NULL::text,NULL::bigint,NULL::bigint)',
    'SELECT public.release_billing_usage(NULL::uuid,NULL::text,NULL::text,NULL::bigint)',
    'SELECT public.grant_billing_usage_addon(NULL::uuid,NULL::text,NULL::text,NULL::bigint)',
    'SELECT public.settle_billing_order(NULL::uuid,NULL::text,NULL::text,NULL::text)',
    'SELECT public.fail_billing_order(NULL::uuid,NULL::text)',
    'SELECT public.record_billing_order_refund(NULL::uuid,NULL::text,NULL::integer)',
    'SELECT public.creator_payout_entry_is_eligible(NULL::public.creator_earnings_ledger)',
    'SELECT public.get_creator_payout_balance(NULL::uuid)',
    'SELECT public.list_creator_payout_candidates(NULL::integer,NULL::integer)',
    'SELECT public.reserve_creator_payout(NULL::uuid,NULL::text,NULL::integer)',
    'SELECT public.mark_creator_payout_transferred(NULL::uuid,NULL::text)',
    'SELECT public.mark_creator_payout_failed(NULL::uuid,NULL::text,NULL::text)',
    'SELECT public.get_user_marketplace_fee_bps(NULL::uuid)'
  ] LOOP
    BEGIN
      EXECUTE call_sql;
      RAISE EXCEPTION 'browser invocation unexpectedly succeeded: %', call_sql;
    EXCEPTION WHEN insufficient_privilege THEN
      NULL;
    END;
  END LOOP;
END $$;
RESET ROLE;

SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM public.get_my_billing_usage_snapshot();
    RAISE EXCEPTION 'anonymous snapshot invocation unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END $$;
RESET ROLE;

-- Service role must still invoke the read-only payout and eligibility RPCs.
SET LOCAL ROLE service_role;
SELECT public.get_creator_payout_balance('00000000-0000-4000-8000-000000000167'::uuid);
SELECT public.creator_payout_entry_is_eligible(NULL::public.creator_earnings_ledger);
RESET ROLE;

-- Reuse the full semantic schema checker after the narrow repair.
\ir verify-commercial-live-schema.sql

ROLLBACK;
\echo COMMERCIAL ACL CORRECTION REHEARSAL PASSED (all changes rolled back)
