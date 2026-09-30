-- Regression contract for GA internal SECURITY DEFINER privilege boundaries.
\set ON_ERROR_STOP on

DO $$
DECLARE
  sig text;
  role_name text;
BEGIN
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
  ]
  LOOP
    IF to_regprocedure(sig) IS NULL THEN
      RAISE EXCEPTION 'expected internal RPC % to exist', sig;
    END IF;

    FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF has_function_privilege(role_name, sig, 'EXECUTE') THEN
        RAISE EXCEPTION 'browser role % must not execute internal RPC %', role_name, sig;
      END IF;
    END LOOP;

    IF NOT has_function_privilege('service_role', sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'service_role must execute internal RPC %', sig;
    END IF;
  END LOOP;

  IF has_function_privilege(
       'anon',
       'public.log_audit_event(text,uuid,uuid,text,text,text,jsonb)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'anon must not execute log_audit_event';
  END IF;

  IF NOT has_function_privilege(
       'authenticated',
       'public.log_audit_event(text,uuid,uuid,text,text,text,jsonb)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'authenticated must execute log_audit_event';
  END IF;

  IF has_function_privilege('anon','public.set_platform_fee(integer)','EXECUTE') THEN
    RAISE EXCEPTION 'anon must not execute set_platform_fee';
  END IF;
END
$$;

SELECT 'GA internal RPC privilege convergence: PASS' AS result;
