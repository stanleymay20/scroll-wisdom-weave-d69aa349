
-- =========================================================================
-- PLATFORM CONFIG
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.platform_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.platform_config ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read the platform fee (needed to render UI / checkout previews)
CREATE POLICY "Authenticated can read fee config"
  ON public.platform_config FOR SELECT
  TO authenticated
  USING (key = 'revenue.platform_fee_bps');

CREATE POLICY "Admins can read all config"
  ON public.platform_config FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- No client writes; only via set_platform_fee SECURITY DEFINER.

INSERT INTO public.platform_config (key, value)
VALUES ('revenue.platform_fee_bps', jsonb_build_object('bps', 1500))
ON CONFLICT (key) DO NOTHING;

-- =========================================================================
-- CREATOR PAYOUT PROFILES
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.creator_payout_profiles (
  user_id uuid PRIMARY KEY,
  payout_method text NOT NULL DEFAULT 'unset'
    CHECK (payout_method IN ('unset','stripe_connect','manual')),
  stripe_connect_account_id text,
  stripe_connect_status text NOT NULL DEFAULT 'not_started'
    CHECK (stripe_connect_status IN ('not_started','pending','verified','restricted','disabled')),
  payout_email text,
  country_code text,
  tax_form_status text NOT NULL DEFAULT 'not_required'
    CHECK (tax_form_status IN ('not_required','pending','submitted','verified','rejected')),
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.creator_payout_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read own payout profile"
  ON public.creator_payout_profiles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Owners insert own payout profile"
  ON public.creator_payout_profiles FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Owners update own payout profile (non-stripe fields)"
  ON public.creator_payout_profiles FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins read all payout profiles"
  ON public.creator_payout_profiles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_payout_profiles_updated_at
  BEFORE UPDATE ON public.creator_payout_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- CREATOR EARNINGS LEDGER (immutable, append-only)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.creator_earnings_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL,
  creator_user_id uuid NOT NULL,
  book_id uuid NOT NULL,
  listing_id uuid,

  entry_type text NOT NULL CHECK (entry_type IN ('sale','refund','chargeback','adjustment')),

  gross_cents integer NOT NULL,
  platform_fee_cents integer NOT NULL,
  creator_net_cents integer NOT NULL,
  fee_bps_applied integer NOT NULL,
  currency text NOT NULL DEFAULT 'usd',

  -- Multi-currency placeholder (future)
  base_currency text,
  exchange_rate_snapshot numeric,

  -- Payout lifecycle
  payout_status text NOT NULL DEFAULT 'pending'
    CHECK (payout_status IN ('pending','available','paid_out','held','void')),
  payout_batch_id uuid,
  available_at timestamptz,
  hold_reason text,

  -- Chargeback / dispute lifecycle
  chargeback_status text
    CHECK (chargeback_status IN ('disputed','chargeback_pending','chargeback_lost','chargeback_won')),

  -- Historical snapshots (preserve context even if records mutate later)
  book_title_snapshot text,
  creator_display_name_snapshot text,
  listing_slug_snapshot text,

  -- Fraud (reserved)
  risk_score numeric,
  fraud_flags jsonb NOT NULL DEFAULT '[]',

  metadata jsonb NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Idempotency: one (purchase, entry_type) row max
  UNIQUE (purchase_id, entry_type)
);

CREATE INDEX IF NOT EXISTS idx_earnings_creator_time
  ON public.creator_earnings_ledger (creator_user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_earnings_book
  ON public.creator_earnings_ledger (book_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_earnings_payout_status
  ON public.creator_earnings_ledger (payout_status);

ALTER TABLE public.creator_earnings_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Creators read own earnings"
  ON public.creator_earnings_ledger FOR SELECT
  TO authenticated
  USING (creator_user_id = auth.uid());

CREATE POLICY "Admins read all earnings"
  ON public.creator_earnings_ledger FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- No INSERT / UPDATE / DELETE policies — service role only,
-- and even service role is blocked from UPDATE/DELETE by this trigger.
CREATE OR REPLACE FUNCTION public.block_ledger_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'creator_earnings_ledger is append-only (%, %)', TG_OP, OLD.id;
END;
$$;

CREATE TRIGGER trg_ledger_no_update
  BEFORE UPDATE ON public.creator_earnings_ledger
  FOR EACH ROW EXECUTE FUNCTION public.block_ledger_mutation();

CREATE TRIGGER trg_ledger_no_delete
  BEFORE DELETE ON public.creator_earnings_ledger
  FOR EACH ROW EXECUTE FUNCTION public.block_ledger_mutation();

-- =========================================================================
-- CREATOR REVENUE DAILY (rollup)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.creator_revenue_daily (
  creator_user_id uuid NOT NULL,
  book_id uuid NOT NULL,
  day date NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  gross_cents bigint NOT NULL DEFAULT 0,
  refund_cents bigint NOT NULL DEFAULT 0,
  net_cents bigint NOT NULL DEFAULT 0,
  platform_fee_cents bigint NOT NULL DEFAULT 0,
  sales_count integer NOT NULL DEFAULT 0,
  refund_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (creator_user_id, book_id, day, currency)
);

CREATE INDEX IF NOT EXISTS idx_revenue_daily_creator_day
  ON public.creator_revenue_daily (creator_user_id, day DESC);

ALTER TABLE public.creator_revenue_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Creators read own daily revenue"
  ON public.creator_revenue_daily FOR SELECT
  TO authenticated
  USING (creator_user_id = auth.uid());

CREATE POLICY "Admins read all daily revenue"
  ON public.creator_revenue_daily FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- =========================================================================
-- LEDGER WRITE FUNCTION (idempotent, service-role only effective entry point)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.record_purchase_ledger(_purchase_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _p record;
  _book record;
  _listing record;
  _author record;
  _fee_bps int;
  _gross int;
  _fee int;
  _net int;
  _sale_exists boolean;
  _refund_exists boolean;
  _entry_type text;
  _gross_signed int;
  _fee_signed int;
  _net_signed int;
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

  _gross := COALESCE(_p.amount_cents, 0);
  _fee := (_gross::numeric * _fee_bps / 10000)::int;
  _net := _gross - _fee;
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

  -- Insert the sale row once (status must be paid OR purchase is free)
  IF NOT _sale_exists AND (_p.status IN ('paid','refunded')) THEN
    INSERT INTO public.creator_earnings_ledger (
      purchase_id, creator_user_id, book_id, listing_id,
      entry_type, gross_cents, platform_fee_cents, creator_net_cents,
      fee_bps_applied, currency, base_currency,
      payout_status, available_at,
      book_title_snapshot, creator_display_name_snapshot, listing_slug_snapshot,
      occurred_at, metadata
    ) VALUES (
      _purchase_id, _book.user_id, _p.book_id, _p.listing_id,
      'sale', _gross, _fee, _net,
      _fee_bps, _p.currency, _p.currency,
      'pending', COALESCE(_p.purchased_at, now()) + interval '14 days',
      _book.title, COALESCE(_author.display_name, ''), COALESCE(_listing.slug, ''),
      COALESCE(_p.purchased_at, now()),
      jsonb_build_object('source','record_purchase_ledger')
    )
    ON CONFLICT (purchase_id, entry_type) DO NOTHING;

    -- Rollup
    INSERT INTO public.creator_revenue_daily (
      creator_user_id, book_id, day, currency,
      gross_cents, platform_fee_cents, net_cents, sales_count
    ) VALUES (
      _book.user_id, _p.book_id, _day, _p.currency,
      _gross, _fee, _net, 1
    )
    ON CONFLICT (creator_user_id, book_id, day, currency) DO UPDATE
    SET gross_cents = creator_revenue_daily.gross_cents + EXCLUDED.gross_cents,
        platform_fee_cents = creator_revenue_daily.platform_fee_cents + EXCLUDED.platform_fee_cents,
        net_cents = creator_revenue_daily.net_cents + EXCLUDED.net_cents,
        sales_count = creator_revenue_daily.sales_count + 1,
        updated_at = now();
  END IF;

  -- If purchase is refunded and we haven't written a refund pair yet
  IF _p.status = 'refunded' AND NOT _refund_exists THEN
    INSERT INTO public.creator_earnings_ledger (
      purchase_id, creator_user_id, book_id, listing_id,
      entry_type, gross_cents, platform_fee_cents, creator_net_cents,
      fee_bps_applied, currency, base_currency,
      payout_status,
      book_title_snapshot, creator_display_name_snapshot, listing_slug_snapshot,
      occurred_at, metadata
    ) VALUES (
      _purchase_id, _book.user_id, _p.book_id, _p.listing_id,
      'refund', -_gross, -_fee, -_net,
      _fee_bps, _p.currency, _p.currency,
      'void',
      _book.title, COALESCE(_author.display_name, ''), COALESCE(_listing.slug, ''),
      now(),
      jsonb_build_object('source','record_purchase_ledger_refund')
    )
    ON CONFLICT (purchase_id, entry_type) DO NOTHING;

    INSERT INTO public.creator_revenue_daily (
      creator_user_id, book_id, day, currency,
      gross_cents, platform_fee_cents, net_cents, refund_cents, refund_count
    ) VALUES (
      _book.user_id, _p.book_id, (now() AT TIME ZONE 'UTC')::date, _p.currency,
      -_gross, -_fee, -_net, _gross, 1
    )
    ON CONFLICT (creator_user_id, book_id, day, currency) DO UPDATE
    SET gross_cents = creator_revenue_daily.gross_cents + EXCLUDED.gross_cents,
        platform_fee_cents = creator_revenue_daily.platform_fee_cents + EXCLUDED.platform_fee_cents,
        net_cents = creator_revenue_daily.net_cents + EXCLUDED.net_cents,
        refund_cents = creator_revenue_daily.refund_cents + EXCLUDED.refund_cents,
        refund_count = creator_revenue_daily.refund_count + 1,
        updated_at = now();
  END IF;

  RETURN jsonb_build_object('ok', true, 'creator_user_id', _book.user_id, 'fee_bps', _fee_bps);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_purchase_ledger(uuid) FROM PUBLIC, anon, authenticated;

-- =========================================================================
-- ADMIN: update platform fee
-- =========================================================================
CREATE OR REPLACE FUNCTION public.set_platform_fee(_bps int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _old int;
BEGIN
  IF _caller IS NULL OR NOT public.has_role(_caller, 'admin') THEN
    RAISE EXCEPTION 'admin_required';
  END IF;
  IF _bps < 0 OR _bps > 10000 THEN
    RAISE EXCEPTION 'invalid_bps';
  END IF;

  SELECT (value->>'bps')::int INTO _old FROM public.platform_config
    WHERE key = 'revenue.platform_fee_bps';

  INSERT INTO public.platform_config (key, value, updated_at, updated_by)
  VALUES ('revenue.platform_fee_bps', jsonb_build_object('bps', _bps), now(), _caller)
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_at = now(),
        updated_by = _caller;

  PERFORM public.log_audit_event(
    'platform_fee_updated', _caller, NULL, 'platform_config', 'revenue.platform_fee_bps',
    'info', jsonb_build_object('old_bps', _old, 'new_bps', _bps)
  );

  RETURN jsonb_build_object('ok', true, 'old_bps', _old, 'new_bps', _bps);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_platform_fee(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_platform_fee(int) TO authenticated;
