-- GA convergence: close browser execution of internal SECURITY DEFINER RPCs.
--
-- Production drift was observed after the September 2026 consolidation path:
-- functions whose source migrations explicitly revoked browser execution had
-- regained the default PUBLIC EXECUTE privilege. Because SECURITY DEFINER runs
-- with the function owner's privileges, browser access to these helpers can
-- bypass RLS and mutate or expose server-owned state.
--
-- This migration is intentionally explicit rather than revoking every
-- SECURITY DEFINER function. Several public/RLS helpers are legitimately
-- callable by browser roles. The list below contains only functions whose
-- repository call sites and comments make them server/maintenance-only.

DO $hardening$
DECLARE
  sig text;
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
    IF to_regprocedure(sig) IS NOT NULL THEN
      EXECUTE 'REVOKE ALL ON FUNCTION ' || sig || ' FROM PUBLIC, anon, authenticated';
      EXECUTE 'GRANT EXECUTE ON FUNCTION ' || sig || ' TO service_role';
    END IF;
  END LOOP;
END
$hardening$;

-- Client audit events are still needed by authenticated product surfaces, but
-- the caller must never be able to forge another user's actor_id. Anonymous
-- callers have no legitimate audit-write path.
CREATE OR REPLACE FUNCTION public.log_audit_event(
  _event_type text,
  _actor_id uuid DEFAULT NULL,
  _organization_id uuid DEFAULT NULL,
  _resource_type text DEFAULT NULL,
  _resource_id text DEFAULT NULL,
  _severity text DEFAULT 'info',
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
  _caller uuid := auth.uid();
  _effective_actor uuid;
BEGIN
  IF _event_type IS NULL OR length(btrim(_event_type)) = 0 THEN
    RAISE EXCEPTION 'event_type_required';
  END IF;

  -- Browser callers are bound to their authenticated identity. Trusted
  -- service/database callers have auth.uid() = NULL and may provide the actor
  -- explicitly for server-side audit attribution.
  _effective_actor := CASE
    WHEN _caller IS NOT NULL THEN _caller
    ELSE _actor_id
  END;

  INSERT INTO public.audit_log (
    event_type, actor_id, organization_id,
    resource_type, resource_id, severity, metadata
  )
  VALUES (
    _event_type, _effective_actor, _organization_id,
    _resource_type, _resource_id, COALESCE(NULLIF(_severity,''),'info'),
    COALESCE(_metadata,'{}'::jsonb)
  )
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_audit_event(text,uuid,uuid,text,text,text,jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_audit_event(text,uuid,uuid,text,text,text,jsonb)
  TO authenticated, service_role;

-- set_platform_fee already enforces auth.uid() + canonical admin role, but
-- anonymous callers still should not reach the SECURITY DEFINER body.
REVOKE ALL ON FUNCTION public.set_platform_fee(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_platform_fee(integer)
  TO authenticated, service_role;

DO $assertions$
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
      RAISE EXCEPTION 'GA RPC hardening expected function % to exist', sig;
    END IF;

    FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF has_function_privilege(role_name, sig, 'EXECUTE') THEN
        RAISE EXCEPTION 'GA RPC hardening failed: role % can execute %', role_name, sig;
      END IF;
    END LOOP;

    IF NOT has_function_privilege('service_role', sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'GA RPC hardening failed: service_role cannot execute %', sig;
    END IF;
  END LOOP;

  IF has_function_privilege(
       'anon',
       'public.log_audit_event(text,uuid,uuid,text,text,text,jsonb)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'GA RPC hardening failed: anon can execute log_audit_event';
  END IF;

  IF NOT has_function_privilege(
       'authenticated',
       'public.log_audit_event(text,uuid,uuid,text,text,text,jsonb)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'GA RPC hardening failed: authenticated cannot execute log_audit_event';
  END IF;

  IF has_function_privilege(
       'anon',
       'public.set_platform_fee(integer)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'GA RPC hardening failed: anon can execute set_platform_fee';
  END IF;
END
$assertions$;
