
-- 1. Extend creator_entitlements with payment status + grace period + richer Stripe state
ALTER TABLE public.creator_entitlements
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS grace_period_until timestamptz,
  ADD COLUMN IF NOT EXISTS current_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_price_id text;

-- Replace tier check with payment_status check
DO $$ BEGIN
  ALTER TABLE public.creator_entitlements
    ADD CONSTRAINT creator_entitlements_payment_status_check
    CHECK (payment_status IN ('active','past_due','grace_period','canceled','incomplete'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_creator_entitlements_grace
  ON public.creator_entitlements(grace_period_until)
  WHERE grace_period_until IS NOT NULL;

-- 2. Immutable historical snapshots
CREATE TABLE IF NOT EXISTS public.creator_entitlement_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tier text NOT NULL,
  payment_status text NOT NULL DEFAULT 'active',
  capabilities jsonb NOT NULL,
  rev_share_surcharge_bps integer NOT NULL,
  source text NOT NULL,
  stripe_subscription_id text,
  stripe_price_id text,
  context_type text NOT NULL,  -- 'export_job' | 'external_publish' | 'scheduled_release' | 'manual'
  context_id uuid,
  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ent_snapshots_user ON public.creator_entitlement_snapshots(user_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_ent_snapshots_context ON public.creator_entitlement_snapshots(context_type, context_id);

ALTER TABLE public.creator_entitlement_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own snapshots" ON public.creator_entitlement_snapshots
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- Snapshots are append-only; only service role / definer functions can insert.
-- (No INSERT policy = no client inserts.)

-- 3. Add entitlement_snapshot_id to gated tables (additive)
ALTER TABLE public.export_jobs
  ADD COLUMN IF NOT EXISTS entitlement_snapshot_id uuid REFERENCES public.creator_entitlement_snapshots(id);
ALTER TABLE public.external_publications
  ADD COLUMN IF NOT EXISTS entitlement_snapshot_id uuid REFERENCES public.creator_entitlement_snapshots(id);
ALTER TABLE public.release_schedule_items
  ADD COLUMN IF NOT EXISTS entitlement_snapshot_id uuid REFERENCES public.creator_entitlement_snapshots(id);

-- 4. Replace sync RPC with richer Stripe-aware version
DROP FUNCTION IF EXISTS public.sync_creator_entitlement_from_stripe(uuid, text, text, timestamptz);

CREATE OR REPLACE FUNCTION public.sync_creator_entitlement_from_stripe(
  _user_id uuid,
  _tier text,
  _stripe_subscription_id text,
  _stripe_customer_id text,
  _stripe_price_id text,
  _stripe_status text,                   -- active | past_due | canceled | incomplete | trialing | unpaid
  _current_period_end timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment_status text;
  v_grace_until timestamptz;
  v_effective_tier text;
  v_can_publish boolean;
  v_can_schedule boolean;
  v_collections_unlimited boolean;
  v_priority boolean;
  v_bonus int;
  v_surcharge int;
  v_existing record;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user_id required';
  END IF;

  SELECT * INTO v_existing FROM public.creator_entitlements WHERE user_id = _user_id;

  -- Determine payment_status + grace handling
  v_payment_status := COALESCE(_stripe_status, 'active');
  v_grace_until := v_existing.grace_period_until;
  v_effective_tier := COALESCE(_tier, 'free');

  IF _stripe_status IN ('active','trialing') THEN
    v_payment_status := 'active';
    v_grace_until := NULL;
  ELSIF _stripe_status = 'past_due' THEN
    -- Keep capabilities for 7 days
    v_payment_status := 'grace_period';
    v_grace_until := COALESCE(v_existing.grace_period_until, now() + interval '7 days');
    -- Keep prior effective tier during grace
    v_effective_tier := COALESCE(v_existing.tier, _tier, 'free');
  ELSIF _stripe_status IN ('canceled','unpaid','incomplete_expired') THEN
    v_payment_status := 'canceled';
    v_grace_until := NULL;
    v_effective_tier := 'free';
  ELSIF _stripe_status = 'incomplete' THEN
    v_payment_status := 'incomplete';
    v_effective_tier := 'free';
  END IF;

  -- Map tier → capabilities
  IF v_effective_tier = 'creator' THEN
    v_can_publish := true;
    v_can_schedule := true;
    v_collections_unlimited := true;
    v_priority := false;
    v_bonus := 0;
    v_surcharge := 0;
  ELSIF v_effective_tier = 'creator_pro' THEN
    v_can_publish := true;
    v_can_schedule := true;
    v_collections_unlimited := true;
    v_priority := true;
    v_bonus := 50;
    v_surcharge := 0;
  ELSE
    v_effective_tier := 'free';
    v_can_publish := false;
    v_can_schedule := false;
    v_collections_unlimited := false;
    v_priority := false;
    v_bonus := 0;
    v_surcharge := 1000;
  END IF;

  INSERT INTO public.creator_entitlements (
    user_id, tier, can_publish_external, can_schedule_releases,
    can_use_collections_unlimited, priority_generation, monthly_generation_bonus,
    rev_share_surcharge_bps, source,
    stripe_subscription_id, stripe_customer_id, stripe_price_id,
    payment_status, grace_period_until, current_period_end,
    granted_at, updated_at
  ) VALUES (
    _user_id, v_effective_tier, v_can_publish, v_can_schedule,
    v_collections_unlimited, v_priority, v_bonus,
    v_surcharge, 'stripe',
    _stripe_subscription_id, _stripe_customer_id, _stripe_price_id,
    v_payment_status, v_grace_until, _current_period_end,
    now(), now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    tier = EXCLUDED.tier,
    can_publish_external = EXCLUDED.can_publish_external,
    can_schedule_releases = EXCLUDED.can_schedule_releases,
    can_use_collections_unlimited = EXCLUDED.can_use_collections_unlimited,
    priority_generation = EXCLUDED.priority_generation,
    monthly_generation_bonus = EXCLUDED.monthly_generation_bonus,
    rev_share_surcharge_bps = EXCLUDED.rev_share_surcharge_bps,
    source = EXCLUDED.source,
    stripe_subscription_id = EXCLUDED.stripe_subscription_id,
    stripe_customer_id = EXCLUDED.stripe_customer_id,
    stripe_price_id = EXCLUDED.stripe_price_id,
    payment_status = EXCLUDED.payment_status,
    grace_period_until = EXCLUDED.grace_period_until,
    current_period_end = EXCLUDED.current_period_end,
    updated_at = now();

  -- Audit
  INSERT INTO public.publishing_audit_log (user_id, platform, event_type, severity, message, metadata)
  VALUES (_user_id, NULL, 'entitlement_synced', 'info',
    format('Entitlement synced from Stripe: tier=%s status=%s', v_effective_tier, v_payment_status),
    jsonb_build_object(
      'stripe_status', _stripe_status,
      'effective_tier', v_effective_tier,
      'payment_status', v_payment_status,
      'grace_period_until', v_grace_until,
      'subscription_id', _stripe_subscription_id,
      'price_id', _stripe_price_id
    ));

  RETURN jsonb_build_object(
    'user_id', _user_id,
    'tier', v_effective_tier,
    'payment_status', v_payment_status,
    'grace_period_until', v_grace_until
  );
END;
$$;

-- 5. Snapshot helper: capture current entitlement state for proof
CREATE OR REPLACE FUNCTION public.snapshot_creator_entitlement(
  _user_id uuid,
  _context_type text,
  _context_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ent record;
  v_snapshot_id uuid;
BEGIN
  IF _user_id IS NULL OR _context_type IS NULL THEN
    RAISE EXCEPTION 'user_id and context_type required';
  END IF;

  SELECT * INTO v_ent FROM public.creator_entitlements WHERE user_id = _user_id;

  INSERT INTO public.creator_entitlement_snapshots (
    user_id, tier, payment_status, capabilities, rev_share_surcharge_bps,
    source, stripe_subscription_id, stripe_price_id,
    context_type, context_id
  ) VALUES (
    _user_id,
    COALESCE(v_ent.tier, 'free'),
    COALESCE(v_ent.payment_status, 'active'),
    jsonb_build_object(
      'can_publish_external', COALESCE(v_ent.can_publish_external, false),
      'can_schedule_releases', COALESCE(v_ent.can_schedule_releases, false),
      'can_use_collections_unlimited', COALESCE(v_ent.can_use_collections_unlimited, false),
      'priority_generation', COALESCE(v_ent.priority_generation, false),
      'monthly_generation_bonus', COALESCE(v_ent.monthly_generation_bonus, 0),
      'grace_period_until', v_ent.grace_period_until,
      'current_period_end', v_ent.current_period_end
    ),
    COALESCE(v_ent.rev_share_surcharge_bps, 1000),
    COALESCE(v_ent.source, 'default'),
    v_ent.stripe_subscription_id,
    v_ent.stripe_price_id,
    _context_type,
    _context_id
  )
  RETURNING id INTO v_snapshot_id;

  RETURN v_snapshot_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.snapshot_creator_entitlement(uuid, text, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_creator_entitlement_from_stripe(uuid, text, text, text, text, text, timestamptz) FROM anon, authenticated;
