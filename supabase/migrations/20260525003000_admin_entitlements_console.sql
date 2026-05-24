-- ============================================================
-- Phase 4.1b — AdminOps Entitlements & Subscription Console
-- Backend foundation: overview view, admin list RPC, override RPC,
-- entitlement snapshots, and audit event compatibility.
-- ============================================================

-- 1) Ensure Phase 4.1 subscription columns exist. This migration is
-- intentionally defensive so it can apply cleanly whether Lovable already
-- shipped some or all of these fields.
ALTER TABLE public.creator_entitlements
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'none'
    CHECK (payment_status IN ('none','active','trialing','past_due','grace_period','canceled','unpaid','incomplete','incomplete_expired')),
  ADD COLUMN IF NOT EXISTS grace_period_until timestamptz,
  ADD COLUMN IF NOT EXISTS current_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_price_id text;

CREATE INDEX IF NOT EXISTS idx_creator_entitlements_payment_status
  ON public.creator_entitlements(payment_status);
CREATE INDEX IF NOT EXISTS idx_creator_entitlements_stripe_customer
  ON public.creator_entitlements(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_creator_entitlements_grace_period
  ON public.creator_entitlements(grace_period_until)
  WHERE grace_period_until IS NOT NULL;

-- 2) Entitlement snapshots: historical proof of what a creator could do
-- at a given moment/context. Append-only by convention: no client write policies.
CREATE TABLE IF NOT EXISTS public.creator_entitlement_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  context_type text NOT NULL DEFAULT 'admin',
  context_id text,
  tier text NOT NULL DEFAULT 'free',
  payment_status text NOT NULL DEFAULT 'none',
  source text NOT NULL DEFAULT 'default',
  can_publish_external boolean NOT NULL DEFAULT false,
  can_schedule_releases boolean NOT NULL DEFAULT false,
  can_use_collections_unlimited boolean NOT NULL DEFAULT false,
  priority_generation boolean NOT NULL DEFAULT false,
  monthly_generation_bonus int NOT NULL DEFAULT 0,
  rev_share_surcharge_bps int NOT NULL DEFAULT 1000,
  stripe_subscription_id text,
  stripe_customer_id text,
  stripe_price_id text,
  current_period_end timestamptz,
  grace_period_until timestamptz,
  expires_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entitlement_snapshots_user_time
  ON public.creator_entitlement_snapshots(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_entitlement_snapshots_context
  ON public.creator_entitlement_snapshots(context_type, context_id)
  WHERE context_id IS NOT NULL;

ALTER TABLE public.creator_entitlement_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own entitlement snapshots" ON public.creator_entitlement_snapshots;
CREATE POLICY "Users read own entitlement snapshots"
ON public.creator_entitlement_snapshots FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins read all entitlement snapshots" ON public.creator_entitlement_snapshots;
CREATE POLICY "Admins read all entitlement snapshots"
ON public.creator_entitlement_snapshots FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Snapshot FK hooks are additive and optional. They are included here so
-- the admin console can trace future exports/publications/releases to the
-- effective entitlement state at action time.
ALTER TABLE public.export_jobs
  ADD COLUMN IF NOT EXISTS entitlement_snapshot_id uuid REFERENCES public.creator_entitlement_snapshots(id);

ALTER TABLE public.external_publications
  ADD COLUMN IF NOT EXISTS entitlement_snapshot_id uuid REFERENCES public.creator_entitlement_snapshots(id);

ALTER TABLE public.release_schedule_items
  ADD COLUMN IF NOT EXISTS entitlement_snapshot_id uuid REFERENCES public.creator_entitlement_snapshots(id);

-- 3) Audit event compatibility for entitlement operations.
ALTER TABLE public.publishing_audit_log DROP CONSTRAINT IF EXISTS publishing_audit_log_event_type_check;
ALTER TABLE public.publishing_audit_log
  ADD CONSTRAINT publishing_audit_log_event_type_check
  CHECK (event_type IN (
    'publish_started','publish_completed','publish_failed',
    'sync_started','sync_completed','sync_failed',
    'token_revoked','token_expired',
    'external_updated','external_deleted','external_unpublished',
    'publish_blocked_by_tier',
    'entitlement_granted','entitlement_revoked','entitlement_overridden','entitlement_resynced',
    'admin_manual_upgrade','admin_manual_downgrade'
  ));

-- 4) Snapshot helper. SECURITY DEFINER keeps the write path centralized;
-- execution is revoked from ordinary clients below.
CREATE OR REPLACE FUNCTION public.snapshot_creator_entitlement(
  _user_id uuid,
  _context_type text DEFAULT 'admin',
  _context_id text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ent record;
  _snapshot_id uuid;
BEGIN
  SELECT * INTO _ent
  FROM public.creator_entitlements
  WHERE user_id = _user_id;

  INSERT INTO public.creator_entitlement_snapshots (
    user_id, context_type, context_id,
    tier, payment_status, source,
    can_publish_external, can_schedule_releases, can_use_collections_unlimited,
    priority_generation, monthly_generation_bonus, rev_share_surcharge_bps,
    stripe_subscription_id, stripe_customer_id, stripe_price_id,
    current_period_end, grace_period_until, expires_at, metadata
  ) VALUES (
    _user_id,
    COALESCE(NULLIF(_context_type, ''), 'admin'),
    _context_id,
    COALESCE(_ent.tier, 'free'),
    COALESCE(_ent.payment_status, 'none'),
    COALESCE(_ent.source, 'default'),
    COALESCE(_ent.can_publish_external, false),
    COALESCE(_ent.can_schedule_releases, false),
    COALESCE(_ent.can_use_collections_unlimited, false),
    COALESCE(_ent.priority_generation, false),
    COALESCE(_ent.monthly_generation_bonus, 0),
    COALESCE(_ent.rev_share_surcharge_bps, 1000),
    _ent.stripe_subscription_id,
    _ent.stripe_customer_id,
    _ent.stripe_price_id,
    _ent.current_period_end,
    _ent.grace_period_until,
    _ent.expires_at,
    COALESCE(_metadata, '{}'::jsonb)
  )
  RETURNING id INTO _snapshot_id;

  RETURN _snapshot_id;
END;
$$;

REVOKE ALL ON FUNCTION public.snapshot_creator_entitlement(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;

-- 5) Dashboard overview view. Admin-facing only through RLS/RPC; no PII/secrets.
CREATE OR REPLACE VIEW public.admin_creator_subscription_overview
WITH (security_invoker = true)
AS
SELECT
  COUNT(*) FILTER (WHERE COALESCE(ce.tier, 'free') IN ('creator','creator_pro'))::int AS active_creators,
  COUNT(*) FILTER (WHERE COALESCE(ce.tier, 'free') = 'creator')::int AS creator_users,
  COUNT(*) FILTER (WHERE COALESCE(ce.tier, 'free') = 'creator_pro')::int AS creator_pro_users,
  COUNT(*) FILTER (WHERE COALESCE(ce.payment_status, 'none') = 'grace_period'
                    OR (ce.grace_period_until IS NOT NULL AND ce.grace_period_until > now()))::int AS grace_period_users,
  COUNT(*) FILTER (WHERE COALESCE(ce.payment_status, 'none') IN ('past_due','unpaid','incomplete','incomplete_expired'))::int AS failed_payment_users,
  (
    COUNT(*) FILTER (WHERE COALESCE(ce.tier, 'free') = 'creator') * 1900 +
    COUNT(*) FILTER (WHERE COALESCE(ce.tier, 'free') = 'creator_pro') * 4900
  )::bigint AS estimated_mrr_cents,
  COUNT(DISTINCT cpc.user_id) FILTER (WHERE cpc.platform = 'shopify' AND COALESCE(cpc.status, '') IN ('connected','active'))::int AS shopify_connected_creators,
  COUNT(DISTINCT cpc.user_id) FILTER (WHERE cpc.platform = 'gumroad' AND COALESCE(cpc.status, '') IN ('connected','active'))::int AS gumroad_connected_creators,
  COUNT(ep.id)::int AS external_publications_count
FROM public.creator_entitlements ce
LEFT JOIN public.creator_platform_connections cpc ON cpc.user_id = ce.user_id
LEFT JOIN public.external_publications ep ON ep.user_id = ce.user_id;

-- 6) Admin list/search RPC for the console table.
CREATE OR REPLACE FUNCTION public.admin_get_creator_entitlements(
  _search text DEFAULT NULL,
  _tier text DEFAULT NULL,
  _payment_status text DEFAULT NULL,
  _limit int DEFAULT 50,
  _offset int DEFAULT 0
)
RETURNS TABLE (
  user_id uuid,
  email text,
  tier text,
  payment_status text,
  grace_period_until timestamptz,
  current_period_end timestamptz,
  stripe_customer_id text,
  stripe_price_id text,
  source text,
  created_at timestamptz,
  updated_at timestamptz,
  shopify_connected boolean,
  gumroad_connected boolean,
  external_publications_count int,
  latest_publish_blocked_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  _caller uuid := auth.uid();
  _lim int := LEAST(GREATEST(COALESCE(_limit, 50), 1), 100);
  _off int := GREATEST(COALESCE(_offset, 0), 0);
BEGIN
  IF _caller IS NULL OR NOT public.has_role(_caller, 'admin') THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      ce.user_id,
      au.email::text AS email,
      ce.tier,
      ce.payment_status,
      ce.grace_period_until,
      ce.current_period_end,
      ce.stripe_customer_id,
      ce.stripe_price_id,
      ce.source,
      ce.granted_at AS created_at,
      ce.updated_at,
      EXISTS (
        SELECT 1 FROM public.creator_platform_connections c
        WHERE c.user_id = ce.user_id
          AND c.platform = 'shopify'
          AND COALESCE(c.status, '') IN ('connected','active')
      ) AS shopify_connected,
      EXISTS (
        SELECT 1 FROM public.creator_platform_connections c
        WHERE c.user_id = ce.user_id
          AND c.platform = 'gumroad'
          AND COALESCE(c.status, '') IN ('connected','active')
      ) AS gumroad_connected,
      (
        SELECT COUNT(*)::int
        FROM public.external_publications ep
        WHERE ep.user_id = ce.user_id
      ) AS external_publications_count,
      (
        SELECT MAX(pal.created_at)
        FROM public.publishing_audit_log pal
        WHERE pal.user_id = ce.user_id
          AND pal.event_type = 'publish_blocked_by_tier'
      ) AS latest_publish_blocked_at
    FROM public.creator_entitlements ce
    LEFT JOIN auth.users au ON au.id = ce.user_id
    WHERE (_tier IS NULL OR _tier = '' OR ce.tier = _tier)
      AND (_payment_status IS NULL OR _payment_status = '' OR ce.payment_status = _payment_status)
      AND (
        _search IS NULL OR _search = '' OR
        ce.user_id::text ILIKE '%' || _search || '%' OR
        au.email ILIKE '%' || _search || '%' OR
        ce.stripe_customer_id ILIKE '%' || _search || '%'
      )
  ), counted AS (
    SELECT base.*, COUNT(*) OVER () AS total_count
    FROM base
    ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
    LIMIT _lim OFFSET _off
  )
  SELECT * FROM counted;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_creator_entitlements(text, text, text, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_creator_entitlements(text, text, text, int, int) TO authenticated;

-- 7) Admin override RPC with snapshot + publishing audit trail.
CREATE OR REPLACE FUNCTION public.admin_override_creator_entitlement(
  _target_user_id uuid,
  _new_tier text,
  _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _old_tier text;
  _event_type text;
  _snapshot_id uuid;
  _result jsonb;
BEGIN
  IF _caller IS NULL OR NOT public.has_role(_caller, 'admin') THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  IF _new_tier NOT IN ('free','creator','creator_pro') THEN
    RAISE EXCEPTION 'invalid_tier';
  END IF;

  SELECT tier INTO _old_tier FROM public.creator_entitlements WHERE user_id = _target_user_id;

  _result := public.admin_set_creator_entitlement(
    _target_user_id,
    _new_tier,
    _reason,
    NULL
  );

  _snapshot_id := public.snapshot_creator_entitlement(
    _target_user_id,
    'admin_override',
    _target_user_id::text,
    jsonb_build_object('reason', _reason, 'old_tier', COALESCE(_old_tier, 'free'), 'new_tier', _new_tier, 'admin_user_id', _caller)
  );

  IF COALESCE(_old_tier, 'free') = _new_tier THEN
    _event_type := 'entitlement_overridden';
  ELSIF _new_tier IN ('creator','creator_pro') THEN
    _event_type := 'admin_manual_upgrade';
  ELSE
    _event_type := 'admin_manual_downgrade';
  END IF;

  INSERT INTO public.publishing_audit_log (
    user_id, platform, event_type, severity, message, metadata
  ) VALUES (
    _target_user_id,
    'scrolllibrary',
    _event_type,
    'info',
    'Admin entitlement override applied',
    jsonb_build_object(
      'old_tier', COALESCE(_old_tier, 'free'),
      'new_tier', _new_tier,
      'reason', _reason,
      'admin_user_id', _caller,
      'snapshot_id', _snapshot_id
    )
  );

  RETURN COALESCE(_result, '{}'::jsonb) || jsonb_build_object(
    'ok', true,
    'snapshot_id', _snapshot_id,
    'old_tier', COALESCE(_old_tier, 'free'),
    'new_tier', _new_tier,
    'event_type', _event_type
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_override_creator_entitlement(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_override_creator_entitlement(uuid, text, text) TO authenticated;

-- 8) Admin detail helpers for the drawer/modals.
CREATE OR REPLACE FUNCTION public.admin_get_creator_entitlement_detail(_target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  _caller uuid := auth.uid();
  _out jsonb;
BEGIN
  IF _caller IS NULL OR NOT public.has_role(_caller, 'admin') THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  SELECT jsonb_build_object(
    'user', jsonb_build_object(
      'user_id', ce.user_id,
      'email', au.email,
      'tier', ce.tier,
      'payment_status', ce.payment_status,
      'grace_period_until', ce.grace_period_until,
      'current_period_end', ce.current_period_end,
      'stripe_customer_id', ce.stripe_customer_id,
      'stripe_price_id', ce.stripe_price_id,
      'stripe_subscription_id', ce.stripe_subscription_id,
      'source', ce.source,
      'updated_at', ce.updated_at
    ),
    'snapshots', COALESCE((
      SELECT jsonb_agg(to_jsonb(s) ORDER BY s.created_at DESC)
      FROM (
        SELECT id, context_type, context_id, tier, payment_status, source,
               can_publish_external, can_schedule_releases, priority_generation,
               rev_share_surcharge_bps, stripe_price_id, current_period_end,
               grace_period_until, metadata, created_at
        FROM public.creator_entitlement_snapshots
        WHERE user_id = _target_user_id
        ORDER BY created_at DESC
        LIMIT 50
      ) s
    ), '[]'::jsonb),
    'audit_events', COALESCE((
      SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC)
      FROM (
        SELECT id, platform, event_type, severity, message, metadata, created_at
        FROM public.publishing_audit_log
        WHERE user_id = _target_user_id
          AND event_type IN (
            'publish_blocked_by_tier','entitlement_granted','entitlement_revoked',
            'entitlement_overridden','entitlement_resynced','admin_manual_upgrade','admin_manual_downgrade',
            'token_revoked','token_expired','publish_failed'
          )
        ORDER BY created_at DESC
        LIMIT 50
      ) a
    ), '[]'::jsonb),
    'publications', COALESCE((
      SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC)
      FROM (
        SELECT id, book_id, listing_id, platform, status, external_id, external_url,
               sync_state, entitlement_snapshot_id, created_at, updated_at
        FROM public.external_publications
        WHERE user_id = _target_user_id
        ORDER BY created_at DESC
        LIMIT 50
      ) p
    ), '[]'::jsonb)
  ) INTO _out
  FROM public.creator_entitlements ce
  LEFT JOIN auth.users au ON au.id = ce.user_id
  WHERE ce.user_id = _target_user_id;

  RETURN COALESCE(_out, jsonb_build_object('user', null, 'snapshots', '[]'::jsonb, 'audit_events', '[]'::jsonb, 'publications', '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_creator_entitlement_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_creator_entitlement_detail(uuid) TO authenticated;

-- 9) Admin resync placeholder. Actual Stripe API calls belong in an edge function;
-- this RPC creates an auditable request marker the edge function can use.
CREATE OR REPLACE FUNCTION public.admin_mark_creator_entitlement_resync_requested(_target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
BEGIN
  IF _caller IS NULL OR NOT public.has_role(_caller, 'admin') THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  INSERT INTO public.publishing_audit_log (
    user_id, platform, event_type, severity, message, metadata
  ) VALUES (
    _target_user_id,
    'stripe',
    'entitlement_resynced',
    'info',
    'Admin requested Stripe entitlement resync',
    jsonb_build_object('admin_user_id', _caller, 'requested_at', now())
  );

  RETURN jsonb_build_object('ok', true, 'user_id', _target_user_id, 'status', 'resync_requested');
END;
$$;

REVOKE ALL ON FUNCTION public.admin_mark_creator_entitlement_resync_requested(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_mark_creator_entitlement_resync_requested(uuid) TO authenticated;
