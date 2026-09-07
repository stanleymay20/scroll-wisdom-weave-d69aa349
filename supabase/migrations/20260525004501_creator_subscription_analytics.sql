-- ============================================================
-- Phase 4.1c — Creator Subscription Analytics
-- Admin-only analytics RPC for MRR, grace risk, churn proxy,
-- entitlement blocks, and publication monetization signals.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_get_creator_subscription_analytics(
  _days int DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _days_clamped int := LEAST(GREATEST(COALESCE(_days, 30), 1), 365);
  _since timestamptz := now() - (LEAST(GREATEST(COALESCE(_days, 30), 1), 365) || ' days')::interval;
  _overview jsonb;
  _tier_breakdown jsonb;
  _payment_breakdown jsonb;
  _blocked jsonb;
  _grace jsonb;
  _series jsonb;
  _top_publishers jsonb;
BEGIN
  IF _caller IS NULL OR NOT public.has_role(_caller, 'admin') THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  SELECT jsonb_build_object(
    'active_creators', COUNT(*) FILTER (WHERE tier IN ('creator','creator_pro')),
    'creator_users', COUNT(*) FILTER (WHERE tier = 'creator'),
    'creator_pro_users', COUNT(*) FILTER (WHERE tier = 'creator_pro'),
    'free_users_with_entitlement_rows', COUNT(*) FILTER (WHERE tier = 'free'),
    'grace_period_users', COUNT(*) FILTER (WHERE payment_status = 'grace_period' OR grace_period_until > now()),
    'failed_payment_users', COUNT(*) FILTER (WHERE payment_status IN ('past_due','unpaid','incomplete','incomplete_expired')),
    'estimated_mrr_cents',
      COUNT(*) FILTER (WHERE tier = 'creator') * 1900 +
      COUNT(*) FILTER (WHERE tier = 'creator_pro') * 4900,
    'estimated_arr_cents',
      (COUNT(*) FILTER (WHERE tier = 'creator') * 1900 +
       COUNT(*) FILTER (WHERE tier = 'creator_pro') * 4900) * 12,
    'stripe_synced_creators', COUNT(*) FILTER (WHERE source = 'stripe'),
    'admin_overrides', COUNT(*) FILTER (WHERE source = 'admin')
  ) INTO _overview
  FROM public.creator_entitlements;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('tier', tier, 'count', count) ORDER BY tier), '[]'::jsonb)
  INTO _tier_breakdown
  FROM (
    SELECT tier, COUNT(*)::int AS count
    FROM public.creator_entitlements
    GROUP BY tier
  ) t;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('status', payment_status, 'count', count) ORDER BY payment_status), '[]'::jsonb)
  INTO _payment_breakdown
  FROM (
    SELECT payment_status, COUNT(*)::int AS count
    FROM public.creator_entitlements
    GROUP BY payment_status
  ) p;

  SELECT jsonb_build_object(
    'count', COUNT(*),
    'latest_at', MAX(created_at),
    'by_platform', COALESCE(jsonb_object_agg(platform, platform_count), '{}'::jsonb)
  ) INTO _blocked
  FROM (
    SELECT platform, COUNT(*)::int AS platform_count, MAX(created_at) AS latest_platform_at
    FROM public.publishing_audit_log
    WHERE event_type = 'publish_blocked_by_tier'
      AND created_at >= _since
    GROUP BY platform
  ) b;

  SELECT COALESCE(jsonb_agg(to_jsonb(g) ORDER BY g.grace_period_until ASC), '[]'::jsonb)
  INTO _grace
  FROM (
    SELECT
      ce.user_id,
      au.email,
      ce.tier,
      ce.payment_status,
      ce.grace_period_until,
      ce.current_period_end
    FROM public.creator_entitlements ce
    LEFT JOIN auth.users au ON au.id = ce.user_id
    WHERE ce.payment_status = 'grace_period'
       OR ce.grace_period_until > now()
    ORDER BY ce.grace_period_until ASC NULLS LAST
    LIMIT 25
  ) g;

  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.day ASC), '[]'::jsonb)
  INTO _series
  FROM (
    SELECT
      d::date AS day,
      COUNT(ce.user_id) FILTER (WHERE ce.tier IN ('creator','creator_pro') AND ce.updated_at::date <= d::date)::int AS active_creators,
      COUNT(pal.id) FILTER (WHERE pal.event_type = 'publish_blocked_by_tier')::int AS blocked_events,
      COUNT(ep.id)::int AS external_publications
    FROM generate_series((_since AT TIME ZONE 'UTC')::date, (now() AT TIME ZONE 'UTC')::date, interval '1 day') d
    LEFT JOIN public.creator_entitlements ce ON ce.updated_at::date <= d::date
    LEFT JOIN public.publishing_audit_log pal ON pal.created_at::date = d::date
    LEFT JOIN public.external_publications ep ON ep.created_at::date = d::date
    GROUP BY d::date
  ) s;

  SELECT COALESCE(jsonb_agg(to_jsonb(tp) ORDER BY tp.external_publications_count DESC, tp.creator_revenue_cents DESC), '[]'::jsonb)
  INTO _top_publishers
  FROM (
    SELECT
      ce.user_id,
      au.email,
      ce.tier,
      COUNT(DISTINCT ep.id)::int AS external_publications_count,
      COALESCE(SUM(cel.creator_net_cents), 0)::bigint AS creator_revenue_cents,
      COALESCE(SUM(cel.platform_fee_cents), 0)::bigint AS platform_fee_cents
    FROM public.creator_entitlements ce
    LEFT JOIN auth.users au ON au.id = ce.user_id
    LEFT JOIN public.external_publications ep ON ep.user_id = ce.user_id AND ep.created_at >= _since
    LEFT JOIN public.creator_earnings_ledger cel ON cel.creator_user_id = ce.user_id AND cel.occurred_at >= _since
    GROUP BY ce.user_id, au.email, ce.tier
    HAVING COUNT(DISTINCT ep.id) > 0 OR COALESCE(SUM(cel.creator_net_cents), 0) <> 0
    ORDER BY external_publications_count DESC, creator_revenue_cents DESC
    LIMIT 20
  ) tp;

  RETURN jsonb_build_object(
    'window_days', _days_clamped,
    'overview', COALESCE(_overview, '{}'::jsonb),
    'tier_breakdown', COALESCE(_tier_breakdown, '[]'::jsonb),
    'payment_breakdown', COALESCE(_payment_breakdown, '[]'::jsonb),
    'blocked_publishing', COALESCE(_blocked, '{}'::jsonb),
    'grace_watchlist', COALESCE(_grace, '[]'::jsonb),
    'daily_series', COALESCE(_series, '[]'::jsonb),
    'top_publishers', COALESCE(_top_publishers, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_creator_subscription_analytics(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_creator_subscription_analytics(int) TO authenticated;
