
-- ============================================================
-- Phase 4.0 — Creator Entitlements & Rev-Share Surcharge
-- ============================================================

CREATE TABLE IF NOT EXISTS public.creator_entitlements (
  user_id uuid PRIMARY KEY,
  tier text NOT NULL DEFAULT 'free' CHECK (tier IN ('free','creator','creator_pro')),
  can_publish_external boolean NOT NULL DEFAULT false,
  can_schedule_releases boolean NOT NULL DEFAULT false,
  can_use_collections_unlimited boolean NOT NULL DEFAULT false,
  priority_generation boolean NOT NULL DEFAULT false,
  monthly_generation_bonus int NOT NULL DEFAULT 0,
  rev_share_surcharge_bps int NOT NULL DEFAULT 1000,
  source text NOT NULL DEFAULT 'default' CHECK (source IN ('default','stripe','admin','grant')),
  stripe_subscription_id text,
  granted_by uuid,
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_creator_entitlements_tier ON public.creator_entitlements(tier);
CREATE INDEX IF NOT EXISTS idx_creator_entitlements_expires ON public.creator_entitlements(expires_at) WHERE expires_at IS NOT NULL;

ALTER TABLE public.creator_entitlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own entitlements" ON public.creator_entitlements;
CREATE POLICY "users read own entitlements"
ON public.creator_entitlements FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins manage entitlements" ON public.creator_entitlements;
CREATE POLICY "admins manage entitlements"
ON public.creator_entitlements FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_creator_entitlements_updated
BEFORE UPDATE ON public.creator_entitlements
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---- Helpers ----------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_user_entitlements(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.creator_entitlements%ROWTYPE;
  _effective_tier text := 'free';
BEGIN
  SELECT * INTO _row FROM public.creator_entitlements WHERE user_id = _user_id;

  IF _row.user_id IS NOT NULL
     AND (_row.expires_at IS NULL OR _row.expires_at > now()) THEN
    _effective_tier := _row.tier;
    RETURN jsonb_build_object(
      'user_id', _user_id,
      'tier', _row.tier,
      'can_publish_external', _row.can_publish_external,
      'can_schedule_releases', _row.can_schedule_releases,
      'can_use_collections_unlimited', _row.can_use_collections_unlimited,
      'priority_generation', _row.priority_generation,
      'monthly_generation_bonus', _row.monthly_generation_bonus,
      'rev_share_surcharge_bps', _row.rev_share_surcharge_bps,
      'source', _row.source,
      'expires_at', _row.expires_at,
      'is_default', false
    );
  END IF;

  -- Free defaults
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
  SELECT public.get_user_entitlements(auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.has_creator_capability(_user_id uuid, _capability text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ent jsonb;
BEGIN
  _ent := public.get_user_entitlements(_user_id);
  RETURN COALESCE((_ent ->> _capability)::boolean, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_rev_share_surcharge_bps(_user_id uuid)
RETURNS int
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    ((public.get_user_entitlements(_user_id)) ->> 'rev_share_surcharge_bps')::int,
    1000
  )
$$;

-- Admin override RPC
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
  _caller uuid := auth.uid();
  _old text;
  _can_pub boolean;
  _can_sched boolean;
  _can_coll boolean;
  _prio boolean;
  _bonus int;
  _surcharge int;
BEGIN
  IF _caller IS NULL OR NOT public.has_role(_caller, 'admin') THEN
    RAISE EXCEPTION 'admin_required';
  END IF;
  IF _tier NOT IN ('free','creator','creator_pro') THEN
    RAISE EXCEPTION 'invalid_tier';
  END IF;

  SELECT tier INTO _old FROM public.creator_entitlements WHERE user_id = _user_id;

  IF _tier = 'free' THEN
    _can_pub := false; _can_sched := false; _can_coll := false;
    _prio := false; _bonus := 0; _surcharge := 1000;
  ELSIF _tier = 'creator' THEN
    _can_pub := true; _can_sched := true; _can_coll := true;
    _prio := false; _bonus := 10; _surcharge := 0;
  ELSE -- creator_pro
    _can_pub := true; _can_sched := true; _can_coll := true;
    _prio := true; _bonus := 50; _surcharge := 0;
  END IF;

  INSERT INTO public.creator_entitlements (
    user_id, tier, can_publish_external, can_schedule_releases,
    can_use_collections_unlimited, priority_generation, monthly_generation_bonus,
    rev_share_surcharge_bps, source, granted_by, granted_at, expires_at, notes, updated_at
  ) VALUES (
    _user_id, _tier, _can_pub, _can_sched,
    _can_coll, _prio, _bonus,
    _surcharge, 'admin', _caller, now(), _expires_at, _notes, now()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET tier = EXCLUDED.tier,
      can_publish_external = EXCLUDED.can_publish_external,
      can_schedule_releases = EXCLUDED.can_schedule_releases,
      can_use_collections_unlimited = EXCLUDED.can_use_collections_unlimited,
      priority_generation = EXCLUDED.priority_generation,
      monthly_generation_bonus = EXCLUDED.monthly_generation_bonus,
      rev_share_surcharge_bps = EXCLUDED.rev_share_surcharge_bps,
      source = EXCLUDED.source,
      granted_by = EXCLUDED.granted_by,
      granted_at = EXCLUDED.granted_at,
      expires_at = EXCLUDED.expires_at,
      notes = COALESCE(EXCLUDED.notes, public.creator_entitlements.notes),
      updated_at = now();

  PERFORM public.log_audit_event(
    'creator_entitlement_updated',
    _caller, NULL, 'creator_entitlements', _user_id::text,
    'info',
    jsonb_build_object('old_tier', _old, 'new_tier', _tier, 'expires_at', _expires_at, 'notes', _notes)
  );

  RETURN jsonb_build_object('ok', true, 'user_id', _user_id, 'tier', _tier);
END;
$$;

-- Service-role / edge-function upsert from Stripe sync
CREATE OR REPLACE FUNCTION public.sync_creator_entitlement_from_stripe(
  _user_id uuid,
  _tier text,
  _stripe_subscription_id text,
  _expires_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _can_pub boolean;
  _can_sched boolean;
  _can_coll boolean;
  _prio boolean;
  _bonus int;
  _surcharge int;
  _existing public.creator_entitlements%ROWTYPE;
BEGIN
  IF _tier NOT IN ('free','creator','creator_pro') THEN
    RAISE EXCEPTION 'invalid_tier';
  END IF;

  SELECT * INTO _existing FROM public.creator_entitlements WHERE user_id = _user_id;
  -- Don't overwrite explicit admin overrides
  IF _existing.user_id IS NOT NULL AND _existing.source = 'admin'
     AND (_existing.expires_at IS NULL OR _existing.expires_at > now()) THEN
    RETURN jsonb_build_object('ok', true, 'skipped', 'admin_override_active');
  END IF;

  IF _tier = 'free' THEN
    _can_pub := false; _can_sched := false; _can_coll := false;
    _prio := false; _bonus := 0; _surcharge := 1000;
  ELSIF _tier = 'creator' THEN
    _can_pub := true; _can_sched := true; _can_coll := true;
    _prio := false; _bonus := 10; _surcharge := 0;
  ELSE
    _can_pub := true; _can_sched := true; _can_coll := true;
    _prio := true; _bonus := 50; _surcharge := 0;
  END IF;

  INSERT INTO public.creator_entitlements (
    user_id, tier, can_publish_external, can_schedule_releases,
    can_use_collections_unlimited, priority_generation, monthly_generation_bonus,
    rev_share_surcharge_bps, source, stripe_subscription_id,
    granted_at, expires_at, updated_at
  ) VALUES (
    _user_id, _tier, _can_pub, _can_sched,
    _can_coll, _prio, _bonus,
    _surcharge, 'stripe', _stripe_subscription_id,
    now(), _expires_at, now()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET tier = EXCLUDED.tier,
      can_publish_external = EXCLUDED.can_publish_external,
      can_schedule_releases = EXCLUDED.can_schedule_releases,
      can_use_collections_unlimited = EXCLUDED.can_use_collections_unlimited,
      priority_generation = EXCLUDED.priority_generation,
      monthly_generation_bonus = EXCLUDED.monthly_generation_bonus,
      rev_share_surcharge_bps = EXCLUDED.rev_share_surcharge_bps,
      source = 'stripe',
      stripe_subscription_id = EXCLUDED.stripe_subscription_id,
      expires_at = EXCLUDED.expires_at,
      updated_at = now();

  RETURN jsonb_build_object('ok', true, 'user_id', _user_id, 'tier', _tier);
END;
$$;

-- Lock down EXECUTE on internal helpers
REVOKE ALL ON FUNCTION public.sync_creator_entitlement_from_stripe(uuid, text, text, timestamptz) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.get_user_entitlements(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.has_creator_capability(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.get_user_rev_share_surcharge_bps(uuid) FROM anon;

-- ============================================================
-- Ledger surcharge columns + updated record_purchase_ledger
-- ============================================================

ALTER TABLE public.creator_earnings_ledger
  ADD COLUMN IF NOT EXISTS rev_share_surcharge_bps int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rev_share_surcharge_cents int NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.record_purchase_ledger(_purchase_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _p record;
  _book record;
  _listing record;
  _author record;
  _fee_bps int;
  _surcharge_bps int;
  _gross int;
  _fee int;
  _surcharge int;
  _net int;
  _sale_exists boolean;
  _refund_exists boolean;
  _day date;
BEGIN
  SELECT * INTO _p FROM public.book_purchases WHERE id = _purchase_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'purchase_not_found'); END IF;

  SELECT id, user_id, title INTO _book FROM public.books WHERE id = _p.book_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'book_not_found'); END IF;

  SELECT id, slug INTO _listing FROM public.public_listings WHERE id = _p.listing_id;
  SELECT display_name INTO _author FROM public.author_profiles WHERE user_id = _book.user_id;

  SELECT (value->>'bps')::int INTO _fee_bps
    FROM public.platform_config WHERE key = 'revenue.platform_fee_bps';
  IF _fee_bps IS NULL THEN _fee_bps := 1500; END IF;

  -- Seller's rev-share surcharge (Free tier = 1000 bps / 10%, Creator+ = 0)
  _surcharge_bps := public.get_user_rev_share_surcharge_bps(_book.user_id);

  _gross := COALESCE(_p.amount_cents, 0);
  _fee := (_gross::numeric * _fee_bps / 10000)::int;
  _surcharge := (_gross::numeric * _surcharge_bps / 10000)::int;
  _net := _gross - _fee - _surcharge;
  _day := (_p.purchased_at AT TIME ZONE 'UTC')::date;
  IF _day IS NULL THEN _day := (now() AT TIME ZONE 'UTC')::date; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.creator_earnings_ledger
    WHERE purchase_id = _purchase_id AND entry_type = 'sale'
  ) INTO _sale_exists;

  SELECT EXISTS (
    SELECT 1 FROM public.creator_earnings_ledger
    WHERE purchase_id = _purchase_id AND entry_type IN ('refund','chargeback')
  ) INTO _refund_exists;

  IF NOT _sale_exists AND (_p.status IN ('paid','refunded')) THEN
    INSERT INTO public.creator_earnings_ledger (
      purchase_id, creator_user_id, book_id, listing_id,
      entry_type, gross_cents, platform_fee_cents, creator_net_cents,
      fee_bps_applied, currency, base_currency,
      payout_status, available_at,
      book_title_snapshot, creator_display_name_snapshot, listing_slug_snapshot,
      occurred_at, metadata,
      rev_share_surcharge_bps, rev_share_surcharge_cents
    ) VALUES (
      _purchase_id, _book.user_id, _p.book_id, _p.listing_id,
      'sale', _gross, _fee + _surcharge, _net,
      _fee_bps, _p.currency, _p.currency,
      'pending', COALESCE(_p.purchased_at, now()) + interval '14 days',
      _book.title, COALESCE(_author.display_name, ''), COALESCE(_listing.slug, ''),
      COALESCE(_p.purchased_at, now()),
      jsonb_build_object('source','record_purchase_ledger','surcharge_bps',_surcharge_bps,'surcharge_cents',_surcharge),
      _surcharge_bps, _surcharge
    )
    ON CONFLICT (purchase_id, entry_type) DO NOTHING;

    INSERT INTO public.creator_revenue_daily (
      creator_user_id, book_id, day, currency,
      gross_cents, platform_fee_cents, net_cents, sales_count
    ) VALUES (
      _book.user_id, _p.book_id, _day, _p.currency,
      _gross, _fee + _surcharge, _net, 1
    )
    ON CONFLICT (creator_user_id, book_id, day, currency) DO UPDATE
    SET gross_cents = creator_revenue_daily.gross_cents + EXCLUDED.gross_cents,
        platform_fee_cents = creator_revenue_daily.platform_fee_cents + EXCLUDED.platform_fee_cents,
        net_cents = creator_revenue_daily.net_cents + EXCLUDED.net_cents,
        sales_count = creator_revenue_daily.sales_count + 1,
        updated_at = now();
  END IF;

  IF _p.status = 'refunded' AND NOT _refund_exists THEN
    INSERT INTO public.creator_earnings_ledger (
      purchase_id, creator_user_id, book_id, listing_id,
      entry_type, gross_cents, platform_fee_cents, creator_net_cents,
      fee_bps_applied, currency, base_currency,
      payout_status,
      book_title_snapshot, creator_display_name_snapshot, listing_slug_snapshot,
      occurred_at, metadata,
      rev_share_surcharge_bps, rev_share_surcharge_cents
    ) VALUES (
      _purchase_id, _book.user_id, _p.book_id, _p.listing_id,
      'refund', -_gross, -(_fee + _surcharge), -_net,
      _fee_bps, _p.currency, _p.currency,
      'void',
      _book.title, COALESCE(_author.display_name, ''), COALESCE(_listing.slug, ''),
      now(),
      jsonb_build_object('source','record_purchase_ledger_refund','surcharge_bps',_surcharge_bps),
      _surcharge_bps, -_surcharge
    )
    ON CONFLICT (purchase_id, entry_type) DO NOTHING;

    INSERT INTO public.creator_revenue_daily (
      creator_user_id, book_id, day, currency,
      gross_cents, platform_fee_cents, net_cents, refund_cents, refund_count
    ) VALUES (
      _book.user_id, _p.book_id, (now() AT TIME ZONE 'UTC')::date, _p.currency,
      -_gross, -(_fee + _surcharge), -_net, _gross, 1
    )
    ON CONFLICT (creator_user_id, book_id, day, currency) DO UPDATE
    SET gross_cents = creator_revenue_daily.gross_cents + EXCLUDED.gross_cents,
        platform_fee_cents = creator_revenue_daily.platform_fee_cents + EXCLUDED.platform_fee_cents,
        net_cents = creator_revenue_daily.net_cents + EXCLUDED.net_cents,
        refund_cents = creator_revenue_daily.refund_cents + EXCLUDED.refund_cents,
        refund_count = creator_revenue_daily.refund_count + 1,
        updated_at = now();
  END IF;

  RETURN jsonb_build_object('ok', true, 'creator_user_id', _book.user_id,
                            'fee_bps', _fee_bps, 'surcharge_bps', _surcharge_bps);
END;
$function$;
