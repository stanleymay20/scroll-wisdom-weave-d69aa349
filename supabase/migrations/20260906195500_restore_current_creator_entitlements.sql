-- Restore the CURRENT creator entitlement and revenue contracts on environments
-- that pre-date the creator-commerce migration era.
--
-- This is intentionally a forward catch-up migration. It does not edit the
-- already-applied core-commerce catch-up. It aligns the database with the
-- current Edge Functions/types: Stripe entitlement sync uses the 7-argument
-- RPC, free creators carry a rev-share surcharge, Creator/Creator Pro remove
-- that surcharge, and refunds reverse the daily creator revenue rollup.

-- ---------------------------------------------------------------------------
-- Current creator entitlement state
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.creator_entitlements (
  user_id uuid PRIMARY KEY,
  tier text NOT NULL DEFAULT 'free',
  can_publish_external boolean NOT NULL DEFAULT false,
  can_schedule_releases boolean NOT NULL DEFAULT false,
  can_use_collections_unlimited boolean NOT NULL DEFAULT false,
  priority_generation boolean NOT NULL DEFAULT false,
  monthly_generation_bonus integer NOT NULL DEFAULT 0,
  rev_share_surcharge_bps integer NOT NULL DEFAULT 1000,
  source text NOT NULL DEFAULT 'default',
  stripe_subscription_id text,
  stripe_customer_id text,
  stripe_price_id text,
  payment_status text NOT NULL DEFAULT 'active',
  grace_period_until timestamptz,
  current_period_end timestamptz,
  granted_by uuid,
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.creator_entitlements
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_price_id text,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS grace_period_until timestamptz,
  ADD COLUMN IF NOT EXISTS current_period_end timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.creator_entitlements'::regclass
      AND conname = 'creator_entitlements_tier_check'
  ) THEN
    ALTER TABLE public.creator_entitlements
      ADD CONSTRAINT creator_entitlements_tier_check
      CHECK (tier IN ('free','creator','creator_pro'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.creator_entitlements'::regclass
      AND conname = 'creator_entitlements_source_check'
  ) THEN
    ALTER TABLE public.creator_entitlements
      ADD CONSTRAINT creator_entitlements_source_check
      CHECK (source IN ('default','stripe','admin','grant'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.creator_entitlements'::regclass
      AND conname = 'creator_entitlements_payment_status_check'
  ) THEN
    ALTER TABLE public.creator_entitlements
      ADD CONSTRAINT creator_entitlements_payment_status_check
      CHECK (payment_status IN ('active','past_due','grace_period','canceled','incomplete'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_creator_entitlements_tier
  ON public.creator_entitlements(tier);
CREATE INDEX IF NOT EXISTS idx_creator_entitlements_expires
  ON public.creator_entitlements(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_creator_entitlements_grace
  ON public.creator_entitlements(grace_period_until) WHERE grace_period_until IS NOT NULL;

ALTER TABLE public.creator_entitlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.creator_entitlements FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.creator_entitlements TO authenticated;
GRANT ALL ON TABLE public.creator_entitlements TO service_role;

DROP POLICY IF EXISTS "users read own entitlements" ON public.creator_entitlements;
DROP POLICY IF EXISTS "admins manage entitlements" ON public.creator_entitlements;
CREATE POLICY "users read own entitlements"
  ON public.creator_entitlements
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  );
CREATE POLICY "admins manage entitlements"
  ON public.creator_entitlements
  FOR ALL TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role))
  WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

DROP TRIGGER IF EXISTS trg_creator_entitlements_updated ON public.creator_entitlements;
CREATE TRIGGER trg_creator_entitlements_updated
  BEFORE UPDATE ON public.creator_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Immutable proof of the entitlement state used for a gated action.
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
  context_type text NOT NULL,
  context_id uuid,
  captured_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ent_snapshots_user
  ON public.creator_entitlement_snapshots(user_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_ent_snapshots_context
  ON public.creator_entitlement_snapshots(context_type, context_id);
ALTER TABLE public.creator_entitlement_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.creator_entitlement_snapshots FROM anon, authenticated;
GRANT SELECT ON TABLE public.creator_entitlement_snapshots TO authenticated;
GRANT ALL ON TABLE public.creator_entitlement_snapshots TO service_role;
DROP POLICY IF EXISTS "users read own snapshots" ON public.creator_entitlement_snapshots;
CREATE POLICY "users read own snapshots"
  ON public.creator_entitlement_snapshots
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  );

-- Add snapshot links only where the gated table exists in this environment.
DO $$
BEGIN
  IF to_regclass('public.export_jobs') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.export_jobs ADD COLUMN IF NOT EXISTS entitlement_snapshot_id uuid REFERENCES public.creator_entitlement_snapshots(id)';
  END IF;
  IF to_regclass('public.external_publications') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.external_publications ADD COLUMN IF NOT EXISTS entitlement_snapshot_id uuid REFERENCES public.creator_entitlement_snapshots(id)';
  END IF;
  IF to_regclass('public.release_schedule_items') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.release_schedule_items ADD COLUMN IF NOT EXISTS entitlement_snapshot_id uuid REFERENCES public.creator_entitlement_snapshots(id)';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Entitlement helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_entitlements(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.creator_entitlements%ROWTYPE;
  v_active boolean := false;
BEGIN
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object(
      'user_id', null,
      'tier', 'free',
      'can_publish_external', false,
      'can_schedule_releases', false,
      'can_use_collections_unlimited', false,
      'priority_generation', false,
      'monthly_generation_bonus', 0,
      'rev_share_surcharge_bps', 1000,
      'source', 'default',
      'expires_at', null,
      'payment_status', 'active',
      'grace_period_until', null,
      'current_period_end', null,
      'is_default', true
    );
  END IF;

  SELECT * INTO v_row
  FROM public.creator_entitlements
  WHERE user_id = _user_id;

  IF v_row.user_id IS NOT NULL
     AND (v_row.expires_at IS NULL OR v_row.expires_at > now()) THEN
    v_active :=
      v_row.payment_status = 'active'
      OR (
        v_row.payment_status = 'grace_period'
        AND v_row.grace_period_until IS NOT NULL
        AND v_row.grace_period_until > now()
      );
  END IF;

  IF v_active THEN
    RETURN jsonb_build_object(
      'user_id', _user_id,
      'tier', v_row.tier,
      'can_publish_external', v_row.can_publish_external,
      'can_schedule_releases', v_row.can_schedule_releases,
      'can_use_collections_unlimited', v_row.can_use_collections_unlimited,
      'priority_generation', v_row.priority_generation,
      'monthly_generation_bonus', v_row.monthly_generation_bonus,
      'rev_share_surcharge_bps', v_row.rev_share_surcharge_bps,
      'source', v_row.source,
      'expires_at', v_row.expires_at,
      'payment_status', v_row.payment_status,
      'grace_period_until', v_row.grace_period_until,
      'current_period_end', v_row.current_period_end,
      'is_default', false
    );
  END IF;

  RETURN jsonb_build_object(
    'user_id', _user_id,
    'tier', 'free',
    'can_publish_external', false,
    'can_schedule_releases', false,
    'can_use_collections_unlimited', false,
    'priority_generation', false,
    'monthly_generation_bonus', 0,
    'rev_share_surcharge_bps', 1000,
    'source', 'default',
    'expires_at', null,
    'payment_status', COALESCE(v_row.payment_status, 'active'),
    'grace_period_until', v_row.grace_period_until,
    'current_period_end', v_row.current_period_end,
    'is_default', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_entitlements()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_user_entitlements((SELECT auth.uid()))
$$;

CREATE OR REPLACE FUNCTION public.has_creator_capability(_user_id uuid, _capability text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ent jsonb;
BEGIN
  v_ent := public.get_user_entitlements(_user_id);
  RETURN COALESCE((v_ent ->> _capability)::boolean, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_rev_share_surcharge_bps(_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    ((public.get_user_entitlements(_user_id)) ->> 'rev_share_surcharge_bps')::integer,
    1000
  )
$$;

CREATE OR REPLACE FUNCTION public.admin_set_creator_entitlement(
  _user_id uuid,
  _tier text,
  _notes text DEFAULT NULL,
  _expires_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_can_pub boolean;
  v_can_sched boolean;
  v_can_coll boolean;
  v_priority boolean;
  v_bonus integer;
  v_surcharge integer;
BEGIN
  IF v_caller IS NULL OR NOT public.has_role(v_caller, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;
  IF _tier NOT IN ('free','creator','creator_pro') THEN
    RAISE EXCEPTION 'invalid_tier';
  END IF;

  IF _tier = 'creator' THEN
    v_can_pub := true; v_can_sched := true; v_can_coll := true;
    v_priority := false; v_bonus := 10; v_surcharge := 0;
  ELSIF _tier = 'creator_pro' THEN
    v_can_pub := true; v_can_sched := true; v_can_coll := true;
    v_priority := true; v_bonus := 50; v_surcharge := 0;
  ELSE
    v_can_pub := false; v_can_sched := false; v_can_coll := false;
    v_priority := false; v_bonus := 0; v_surcharge := 1000;
  END IF;

  INSERT INTO public.creator_entitlements (
    user_id, tier, can_publish_external, can_schedule_releases,
    can_use_collections_unlimited, priority_generation, monthly_generation_bonus,
    rev_share_surcharge_bps, source, payment_status,
    granted_by, granted_at, expires_at, notes, updated_at
  ) VALUES (
    _user_id, _tier, v_can_pub, v_can_sched,
    v_can_coll, v_priority, v_bonus,
    v_surcharge, 'admin', 'active',
    v_caller, now(), _expires_at, _notes, now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    tier = EXCLUDED.tier,
    can_publish_external = EXCLUDED.can_publish_external,
    can_schedule_releases = EXCLUDED.can_schedule_releases,
    can_use_collections_unlimited = EXCLUDED.can_use_collections_unlimited,
    priority_generation = EXCLUDED.priority_generation,
    monthly_generation_bonus = EXCLUDED.monthly_generation_bonus,
    rev_share_surcharge_bps = EXCLUDED.rev_share_surcharge_bps,
    source = 'admin',
    payment_status = 'active',
    granted_by = EXCLUDED.granted_by,
    granted_at = now(),
    expires_at = EXCLUDED.expires_at,
    notes = COALESCE(EXCLUDED.notes, public.creator_entitlements.notes),
    updated_at = now();

  RETURN jsonb_build_object('ok', true, 'user_id', _user_id, 'tier', _tier);
END;
$$;

-- Current Stripe-aware signature used by stripe-webhook and admin resync.
DROP FUNCTION IF EXISTS public.sync_creator_entitlement_from_stripe(uuid, text, text, timestamptz);
CREATE OR REPLACE FUNCTION public.sync_creator_entitlement_from_stripe(
  _user_id uuid,
  _tier text,
  _stripe_subscription_id text,
  _stripe_customer_id text,
  _stripe_price_id text,
  _stripe_status text,
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
  v_bonus integer;
  v_surcharge integer;
  v_existing public.creator_entitlements%ROWTYPE;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'user_id required'; END IF;

  SELECT * INTO v_existing
  FROM public.creator_entitlements
  WHERE user_id = _user_id;

  v_payment_status := COALESCE(_stripe_status, 'active');
  v_grace_until := v_existing.grace_period_until;
  v_effective_tier := COALESCE(_tier, 'free');

  IF _stripe_status IN ('active','trialing') THEN
    v_payment_status := 'active';
    v_grace_until := NULL;
  ELSIF _stripe_status = 'past_due' THEN
    v_payment_status := 'grace_period';
    v_grace_until := COALESCE(v_existing.grace_period_until, now() + interval '7 days');
    v_effective_tier := COALESCE(v_existing.tier, _tier, 'free');
  ELSIF _stripe_status IN ('canceled','unpaid','incomplete_expired') THEN
    v_payment_status := 'canceled';
    v_grace_until := NULL;
    v_effective_tier := 'free';
  ELSIF _stripe_status = 'incomplete' THEN
    v_payment_status := 'incomplete';
    v_effective_tier := 'free';
  END IF;

  IF v_effective_tier = 'creator' THEN
    v_can_publish := true;
    v_can_schedule := true;
    v_collections_unlimited := true;
    v_priority := false;
    v_bonus := 10;
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
    source = 'stripe',
    stripe_subscription_id = EXCLUDED.stripe_subscription_id,
    stripe_customer_id = EXCLUDED.stripe_customer_id,
    stripe_price_id = EXCLUDED.stripe_price_id,
    payment_status = EXCLUDED.payment_status,
    grace_period_until = EXCLUDED.grace_period_until,
    current_period_end = EXCLUDED.current_period_end,
    updated_at = now();

  -- Audit when the optional publishing audit table is present. Dynamic SQL
  -- avoids making this entitlement contract depend on the full publishing OS
  -- migration backlog.
  IF to_regclass('public.publishing_audit_log') IS NOT NULL THEN
    EXECUTE
      'INSERT INTO public.publishing_audit_log (user_id, platform, event_type, severity, message, metadata)
       VALUES ($1, NULL, ''entitlement_synced'', ''info'', $2, $3)'
    USING
      _user_id,
      format('Entitlement synced from Stripe: tier=%s status=%s', v_effective_tier, v_payment_status),
      jsonb_build_object(
        'stripe_status', _stripe_status,
        'effective_tier', v_effective_tier,
        'payment_status', v_payment_status,
        'grace_period_until', v_grace_until,
        'subscription_id', _stripe_subscription_id,
        'price_id', _stripe_price_id
      );
  END IF;

  RETURN jsonb_build_object(
    'user_id', _user_id,
    'tier', v_effective_tier,
    'payment_status', v_payment_status,
    'grace_period_until', v_grace_until
  );
END;
$$;

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
  v_ent jsonb;
  v_snapshot_id uuid;
BEGIN
  IF _user_id IS NULL OR _context_type IS NULL THEN
    RAISE EXCEPTION 'user_id and context_type required';
  END IF;

  v_ent := public.get_user_entitlements(_user_id);

  INSERT INTO public.creator_entitlement_snapshots (
    user_id, tier, payment_status, capabilities, rev_share_surcharge_bps,
    source, stripe_subscription_id, stripe_price_id,
    context_type, context_id
  )
  SELECT
    _user_id,
    COALESCE(v_ent->>'tier', 'free'),
    COALESCE(v_ent->>'payment_status', 'active'),
    jsonb_build_object(
      'can_publish_external', COALESCE((v_ent->>'can_publish_external')::boolean, false),
      'can_schedule_releases', COALESCE((v_ent->>'can_schedule_releases')::boolean, false),
      'can_use_collections_unlimited', COALESCE((v_ent->>'can_use_collections_unlimited')::boolean, false),
      'priority_generation', COALESCE((v_ent->>'priority_generation')::boolean, false),
      'monthly_generation_bonus', COALESCE((v_ent->>'monthly_generation_bonus')::integer, 0),
      'grace_period_until', v_ent->'grace_period_until',
      'current_period_end', v_ent->'current_period_end'
    ),
    COALESCE((v_ent->>'rev_share_surcharge_bps')::integer, 1000),
    COALESCE(v_ent->>'source', 'default'),
    ce.stripe_subscription_id,
    ce.stripe_price_id,
    _context_type,
    _context_id
  FROM (SELECT 1) seed
  LEFT JOIN public.creator_entitlements ce ON ce.user_id = _user_id
  RETURNING id INTO v_snapshot_id;

  RETURN v_snapshot_id;
END;
$$;

-- Least-privilege execution model.
REVOKE ALL ON FUNCTION public.get_user_entitlements(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_entitlements(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.get_my_entitlements() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_entitlements() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.has_creator_capability(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_creator_capability(uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.get_user_rev_share_surcharge_bps(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_rev_share_surcharge_bps(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.admin_set_creator_entitlement(uuid, text, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_creator_entitlement(uuid, text, text, timestamptz) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.sync_creator_entitlement_from_stripe(uuid, text, text, text, text, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_creator_entitlement_from_stripe(uuid, text, text, text, text, text, timestamptz)
  TO service_role;
REVOKE ALL ON FUNCTION public.snapshot_creator_entitlement(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.snapshot_creator_entitlement(uuid, text, uuid)
  TO service_role;

-- ---------------------------------------------------------------------------
-- Current creator revenue ledger with rev-share surcharge + refund rollback
-- ---------------------------------------------------------------------------
ALTER TABLE public.creator_earnings_ledger
  ADD COLUMN IF NOT EXISTS rev_share_surcharge_bps integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rev_share_surcharge_cents integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.record_purchase_ledger(_purchase_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_p record;
  v_book record;
  v_listing record;
  v_author record;
  v_fee_bps integer;
  v_surcharge_bps integer;
  v_gross integer;
  v_fee integer;
  v_surcharge integer;
  v_net integer;
  v_sale_exists boolean;
  v_refund_exists boolean;
  v_day date;
BEGIN
  SELECT * INTO v_p FROM public.book_purchases WHERE id = _purchase_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'purchase_not_found'); END IF;

  SELECT id, user_id, title INTO v_book FROM public.books WHERE id = v_p.book_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'book_not_found'); END IF;

  SELECT id, slug INTO v_listing FROM public.public_listings WHERE id = v_p.listing_id;
  SELECT display_name INTO v_author FROM public.author_profiles WHERE user_id = v_book.user_id;

  SELECT (value->>'bps')::integer INTO v_fee_bps
  FROM public.platform_config WHERE key = 'revenue.platform_fee_bps';
  v_fee_bps := COALESCE(v_fee_bps, 1500);
  v_surcharge_bps := public.get_user_rev_share_surcharge_bps(v_book.user_id);

  v_gross := COALESCE(v_p.amount_cents, 0);
  v_fee := (v_gross::numeric * v_fee_bps / 10000)::integer;
  v_surcharge := (v_gross::numeric * v_surcharge_bps / 10000)::integer;
  v_net := v_gross - v_fee - v_surcharge;
  v_day := COALESCE((v_p.purchased_at AT TIME ZONE 'UTC')::date, (now() AT TIME ZONE 'UTC')::date);

  SELECT EXISTS (
    SELECT 1 FROM public.creator_earnings_ledger
    WHERE purchase_id = _purchase_id AND entry_type = 'sale'
  ) INTO v_sale_exists;
  SELECT EXISTS (
    SELECT 1 FROM public.creator_earnings_ledger
    WHERE purchase_id = _purchase_id AND entry_type IN ('refund','chargeback')
  ) INTO v_refund_exists;

  IF NOT v_sale_exists AND v_p.status IN ('paid','refunded') THEN
    INSERT INTO public.creator_earnings_ledger (
      purchase_id, creator_user_id, book_id, listing_id,
      entry_type, gross_cents, platform_fee_cents, creator_net_cents,
      fee_bps_applied, currency, base_currency,
      payout_status, available_at,
      book_title_snapshot, creator_display_name_snapshot, listing_slug_snapshot,
      occurred_at, metadata,
      rev_share_surcharge_bps, rev_share_surcharge_cents
    ) VALUES (
      _purchase_id, v_book.user_id, v_p.book_id, v_p.listing_id,
      'sale', v_gross, v_fee + v_surcharge, v_net,
      v_fee_bps, v_p.currency, v_p.currency,
      'pending', COALESCE(v_p.purchased_at, now()) + interval '14 days',
      v_book.title, COALESCE(v_author.display_name, ''), COALESCE(v_listing.slug, ''),
      COALESCE(v_p.purchased_at, now()),
      jsonb_build_object('source','record_purchase_ledger','surcharge_bps',v_surcharge_bps,'surcharge_cents',v_surcharge),
      v_surcharge_bps, v_surcharge
    )
    ON CONFLICT (purchase_id, entry_type) DO NOTHING;

    INSERT INTO public.creator_revenue_daily (
      creator_user_id, book_id, day, currency,
      gross_cents, platform_fee_cents, net_cents, sales_count
    ) VALUES (
      v_book.user_id, v_p.book_id, v_day, v_p.currency,
      v_gross, v_fee + v_surcharge, v_net, 1
    )
    ON CONFLICT (creator_user_id, book_id, day, currency) DO UPDATE
    SET gross_cents = creator_revenue_daily.gross_cents + EXCLUDED.gross_cents,
        platform_fee_cents = creator_revenue_daily.platform_fee_cents + EXCLUDED.platform_fee_cents,
        net_cents = creator_revenue_daily.net_cents + EXCLUDED.net_cents,
        sales_count = creator_revenue_daily.sales_count + 1,
        updated_at = now();
  END IF;

  IF v_p.status = 'refunded' AND NOT v_refund_exists THEN
    INSERT INTO public.creator_earnings_ledger (
      purchase_id, creator_user_id, book_id, listing_id,
      entry_type, gross_cents, platform_fee_cents, creator_net_cents,
      fee_bps_applied, currency, base_currency,
      payout_status,
      book_title_snapshot, creator_display_name_snapshot, listing_slug_snapshot,
      occurred_at, metadata,
      rev_share_surcharge_bps, rev_share_surcharge_cents
    ) VALUES (
      _purchase_id, v_book.user_id, v_p.book_id, v_p.listing_id,
      'refund', -v_gross, -(v_fee + v_surcharge), -v_net,
      v_fee_bps, v_p.currency, v_p.currency,
      'void',
      v_book.title, COALESCE(v_author.display_name, ''), COALESCE(v_listing.slug, ''),
      now(),
      jsonb_build_object('source','record_purchase_ledger_refund','surcharge_bps',v_surcharge_bps),
      v_surcharge_bps, -v_surcharge
    )
    ON CONFLICT (purchase_id, entry_type) DO NOTHING;

    INSERT INTO public.creator_revenue_daily (
      creator_user_id, book_id, day, currency,
      gross_cents, platform_fee_cents, net_cents, refund_cents, refund_count
    ) VALUES (
      v_book.user_id, v_p.book_id, (now() AT TIME ZONE 'UTC')::date, v_p.currency,
      -v_gross, -(v_fee + v_surcharge), -v_net, v_gross, 1
    )
    ON CONFLICT (creator_user_id, book_id, day, currency) DO UPDATE
    SET gross_cents = creator_revenue_daily.gross_cents + EXCLUDED.gross_cents,
        platform_fee_cents = creator_revenue_daily.platform_fee_cents + EXCLUDED.platform_fee_cents,
        net_cents = creator_revenue_daily.net_cents + EXCLUDED.net_cents,
        refund_cents = creator_revenue_daily.refund_cents + EXCLUDED.refund_cents,
        refund_count = creator_revenue_daily.refund_count + 1,
        updated_at = now();
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'creator_user_id', v_book.user_id,
    'fee_bps', v_fee_bps,
    'surcharge_bps', v_surcharge_bps
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_purchase_ledger(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_purchase_ledger(uuid) TO service_role;
