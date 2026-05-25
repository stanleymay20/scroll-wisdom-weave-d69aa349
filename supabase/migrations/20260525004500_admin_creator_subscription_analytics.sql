-- ============================================================
-- Phase 4.1c — Creator subscription analytics foundation
-- Adds a compact admin RPC for MRR, churn-risk, grace, failed payment,
-- publishing-block, and external channel health metrics.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_creator_subscription_analytics(
  _days int DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _window int := LEAST(GREATEST(COALESCE(_days, 30), 1), 365);
  _since timestamptz := now() - make_interval(days => LEAST(GREATEST(COALESCE(_days, 30), 1), 365));
  _out jsonb;
BEGIN
  IF _caller IS NULL OR NOT public.has_role(_caller, 'admin') THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  WITH entitlement_base AS (
    SELECT
      user_id,
      tier,
      payment_status,
      grace_period_until,
      current_period_end,
      updated_at,
      CASE tier
        WHEN 'creator' THEN 1900
        WHEN 'creator_pro' THEN 4900
        ELSE 0
      END AS monthly_cents
    FROM public.creator_entitlements
  ),
  totals AS (
    SELECT
      COUNT(*) FILTER (WHERE tier IN ('creator','creator_pro'))::int AS paid_creators,
      COUNT(*) FILTER (WHERE tier = 'creator')::int AS creator_users,
      COUNT(*) FILTER (WHERE tier = 'creator_pro')::int AS creator_pro_users,
      COUNT(*) FILTER (WHERE payment_status IN ('past_due','unpaid','incomplete','incomplete_expired'))::int AS failed_payment_users,
      COUNT(*) FILTER (WHERE payment_status = 'grace_period' OR grace_period_until > now())::int AS grace_users,
      COALESCE(SUM(monthly_cents) FILTER (WHERE tier IN ('creator','creator_pro')), 0)::bigint AS estimated_mrr_cents,
      COALESCE(SUM(monthly_cents) FILTER (WHERE payment_status = 'active'), 0)::bigint AS active_mrr_cents,
      COALESCE(SUM(monthly_cents) FILTER (WHERE payment_status IN ('past_due','unpaid','grace_period')), 0)::bigint AS at_risk_mrr_cents
    FROM entitlement_base
  ),
  publish_blocks AS (
    SELECT
      COUNT(*)::int AS blocked_count,
      COUNT(DISTINCT user_id)::int AS blocked_creators
    FROM public.publishing_audit_log
    WHERE event_type = 'publish_blocked_by_tier'
      AND created_at >= _since
  ),
  resyncs AS (
    SELECT
      COUNT(*)::int AS resync_count,
      COUNT(DISTINCT user_id)::int AS resynced_creators
    FROM public.publishing_audit_log
    WHERE event_type = 'entitlement_resynced'
      AND created_at >= _since
  ),
  external_health AS (
    SELECT
      COUNT(*)::int AS external_publications,
      COUNT(*) FILTER (WHERE platform = 'shopify')::int AS shopify_publications,
      COUNT(*) FILTER (WHERE platform = 'gumroad')::int AS gumroad_publications,
      COUNT(*) FILTER (WHERE sync_state = 'error')::int AS sync_errors,
      COUNT(*) FILTER (WHERE sync_state = 'dirty')::int AS dirty_publications
    FROM public.external_publications
  ),
  recent_events AS (
    SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.created_at DESC), '[]'::jsonb) AS events
    FROM (
      SELECT id, user_id, platform, event_type, severity, message, created_at
      FROM public.publishing_audit_log
      WHERE event_type IN (
        'publish_blocked_by_tier','entitlement_resynced','entitlement_overridden',
        'admin_manual_upgrade','admin_manual_downgrade','token_expired','token_revoked'
      )
      ORDER BY created_at DESC
      LIMIT 25
    ) e
  ),
  tier_breakdown AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'tier', tier,
      'count', cnt,
      'estimated_mrr_cents', mrr
    ) ORDER BY tier), '[]'::jsonb) AS tiers
    FROM (
      SELECT tier, COUNT(*)::int AS cnt, COALESCE(SUM(monthly_cents),0)::bigint AS mrr
      FROM entitlement_base
      GROUP BY tier
    ) t
  ),
  payment_breakdown AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'payment_status', payment_status,
      'count', cnt,
      'estimated_mrr_cents', mrr
    ) ORDER BY payment_status), '[]'::jsonb) AS statuses
    FROM (
      SELECT payment_status, COUNT(*)::int AS cnt, COALESCE(SUM(monthly_cents),0)::bigint AS mrr
      FROM entitlement_base
      GROUP BY payment_status
    ) p
  )
  SELECT jsonb_build_object(
    'window_days', _window,
    'totals', to_jsonb(totals),
    'publish_blocks', to_jsonb(publish_blocks),
    'resyncs', to_jsonb(resyncs),
    'external_health', to_jsonb(external_health),
    'tier_breakdown', tier_breakdown.tiers,
    'payment_breakdown', payment_breakdown.statuses,
    'recent_events', recent_events.events,
    'generated_at', now()
  ) INTO _out
  FROM totals, publish_blocks, resyncs, external_health, tier_breakdown, payment_breakdown, recent_events;

  RETURN COALESCE(_out, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_creator_subscription_analytics(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_creator_subscription_analytics(int) TO authenticated;
