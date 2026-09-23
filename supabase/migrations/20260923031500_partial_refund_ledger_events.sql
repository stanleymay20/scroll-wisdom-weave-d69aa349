-- Support multiple idempotent partial refunds without weakening the append-only
-- creator earnings ledger. Refund identity comes from Stripe refund IDs.

-- Admin refund requests are independently idempotent at the API boundary.
-- The same key may be safely retried, but cannot create a second Stripe refund
-- for the same purchase.
ALTER TABLE public.refund_requests
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS refund_requests_purchase_idempotency_unique
  ON public.refund_requests(purchase_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;


ALTER TABLE public.creator_earnings_ledger
  ADD COLUMN IF NOT EXISTS source_event_id text;

-- The legacy UNIQUE(purchase_id, entry_type) allowed only one refund row.
-- Keep one sale per purchase, but allow many refund events keyed by source ID.
DO $$
DECLARE
  _constraint record;
BEGIN
  FOR _constraint IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.creator_earnings_ledger'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) = 'UNIQUE (purchase_id, entry_type)'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.creator_earnings_ledger DROP CONSTRAINT %I',
      _constraint.conname
    );
  END LOOP;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS creator_earnings_one_sale_per_purchase
  ON public.creator_earnings_ledger(purchase_id)
  WHERE entry_type = 'sale';

CREATE UNIQUE INDEX IF NOT EXISTS creator_earnings_refund_source_event_unique
  ON public.creator_earnings_ledger(source_event_id)
  WHERE source_event_id IS NOT NULL;

-- Sale writer only. Refunds are event-specific and are handled by
-- record_purchase_refund_ledger so partial refunds cannot over-reverse earnings.
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
  v_day date;
BEGIN
  SELECT * INTO v_p
  FROM public.book_purchases
  WHERE id = _purchase_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'purchase_not_found');
  END IF;

  SELECT id, user_id, title INTO v_book
  FROM public.books
  WHERE id = v_p.book_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'book_not_found');
  END IF;

  SELECT id, slug INTO v_listing
  FROM public.public_listings
  WHERE id = v_p.listing_id;

  SELECT display_name INTO v_author
  FROM public.author_profiles
  WHERE user_id = v_book.user_id;

  SELECT (value->>'bps')::integer INTO v_fee_bps
  FROM public.platform_config
  WHERE key = 'revenue.platform_fee_bps';

  v_fee_bps := COALESCE(v_fee_bps, 1500);
  v_surcharge_bps := public.get_user_rev_share_surcharge_bps(v_book.user_id);

  v_gross := COALESCE(v_p.amount_cents, 0);
  v_fee := (v_gross::numeric * v_fee_bps / 10000)::integer;
  v_surcharge := (v_gross::numeric * v_surcharge_bps / 10000)::integer;
  v_net := v_gross - v_fee - v_surcharge;
  v_day := COALESCE(
    (v_p.purchased_at AT TIME ZONE 'UTC')::date,
    (now() AT TIME ZONE 'UTC')::date
  );

  SELECT EXISTS (
    SELECT 1
    FROM public.creator_earnings_ledger
    WHERE purchase_id = _purchase_id
      AND entry_type = 'sale'
  ) INTO v_sale_exists;

  IF NOT v_sale_exists AND v_p.status IN ('paid', 'refunded') THEN
    INSERT INTO public.creator_earnings_ledger (
      purchase_id,
      creator_user_id,
      book_id,
      listing_id,
      entry_type,
      gross_cents,
      platform_fee_cents,
      creator_net_cents,
      fee_bps_applied,
      currency,
      base_currency,
      payout_status,
      available_at,
      book_title_snapshot,
      creator_display_name_snapshot,
      listing_slug_snapshot,
      occurred_at,
      metadata,
      rev_share_surcharge_bps,
      rev_share_surcharge_cents
    )
    VALUES (
      _purchase_id,
      v_book.user_id,
      v_p.book_id,
      v_p.listing_id,
      'sale',
      v_gross,
      v_fee + v_surcharge,
      v_net,
      v_fee_bps,
      v_p.currency,
      v_p.currency,
      'pending',
      COALESCE(v_p.purchased_at, now()) + interval '14 days',
      v_book.title,
      COALESCE(v_author.display_name, ''),
      COALESCE(v_listing.slug, ''),
      COALESCE(v_p.purchased_at, now()),
      jsonb_build_object(
        'source', 'record_purchase_ledger',
        'surcharge_bps', v_surcharge_bps,
        'surcharge_cents', v_surcharge
      ),
      v_surcharge_bps,
      v_surcharge
    )
    ON CONFLICT (purchase_id) WHERE entry_type = 'sale'
    DO NOTHING;

    IF FOUND THEN
      INSERT INTO public.creator_revenue_daily (
        creator_user_id,
        book_id,
        day,
        currency,
        gross_cents,
        platform_fee_cents,
        net_cents,
        sales_count
      )
      VALUES (
        v_book.user_id,
        v_p.book_id,
        v_day,
        v_p.currency,
        v_gross,
        v_fee + v_surcharge,
        v_net,
        1
      )
      ON CONFLICT (creator_user_id, book_id, day, currency)
      DO UPDATE SET
        gross_cents = creator_revenue_daily.gross_cents + EXCLUDED.gross_cents,
        platform_fee_cents = creator_revenue_daily.platform_fee_cents + EXCLUDED.platform_fee_cents,
        net_cents = creator_revenue_daily.net_cents + EXCLUDED.net_cents,
        sales_count = creator_revenue_daily.sales_count + 1,
        updated_at = now();
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'creator_user_id', v_book.user_id,
    'fee_bps', v_fee_bps,
    'surcharge_bps', v_surcharge_bps
  );
END
$$;

REVOKE ALL ON FUNCTION public.record_purchase_ledger(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_purchase_ledger(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.record_purchase_refund_ledger(
  _purchase_id uuid,
  _refund_event_id text,
  _refund_amount_cents integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_p public.book_purchases%ROWTYPE;
  v_sale public.creator_earnings_ledger%ROWTYPE;
  v_existing public.creator_earnings_ledger%ROWTYPE;
  v_prior_refund_gross integer := 0;
  v_prior_refund_fee integer := 0;
  v_prior_refund_net integer := 0;
  v_prior_refund_surcharge integer := 0;
  v_refunded_after integer;
  v_fee_to_reverse integer;
  v_net_to_reverse integer;
  v_surcharge_to_reverse integer;
  v_fully_refunded boolean;
  v_refund_ledger_id uuid;
  v_refund_day date := (now() AT TIME ZONE 'UTC')::date;
  v_sale_result jsonb;
BEGIN
  IF _purchase_id IS NULL THEN
    RAISE EXCEPTION 'purchase_id_required';
  END IF;
  IF _refund_event_id IS NULL OR btrim(_refund_event_id) = '' THEN
    RAISE EXCEPTION 'refund_event_id_required';
  END IF;
  IF _refund_amount_cents IS NULL OR _refund_amount_cents <= 0 THEN
    RAISE EXCEPTION 'refund_amount_must_be_positive';
  END IF;

  -- Serialize refund events per purchase so two Stripe deliveries cannot both
  -- observe the same remaining balance and over-refund the ledger.
  PERFORM pg_advisory_xact_lock(hashtextextended(_purchase_id::text, 17));

  SELECT * INTO v_p
  FROM public.book_purchases
  WHERE id = _purchase_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'purchase_not_found');
  END IF;

  SELECT * INTO v_existing
  FROM public.creator_earnings_ledger
  WHERE source_event_id = _refund_event_id
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.purchase_id <> _purchase_id THEN
      RAISE EXCEPTION 'refund_event_purchase_mismatch';
    END IF;

    SELECT COALESCE(sum(-gross_cents), 0)::integer
      INTO v_prior_refund_gross
    FROM public.creator_earnings_ledger
    WHERE purchase_id = _purchase_id
      AND entry_type = 'refund';

    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'ledger_id', v_existing.id,
      'refunded_total_cents', v_prior_refund_gross,
      'remaining_cents', GREATEST(COALESCE(v_p.amount_cents, 0) - v_prior_refund_gross, 0),
      'fully_refunded', v_prior_refund_gross >= COALESCE(v_p.amount_cents, 0)
    );
  END IF;

  -- Heal a missing sale row before recording its reversal.
  v_sale_result := public.record_purchase_ledger(_purchase_id);
  IF COALESCE((v_sale_result->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'sale_ledger_unavailable:%', v_sale_result;
  END IF;

  SELECT * INTO v_sale
  FROM public.creator_earnings_ledger
  WHERE purchase_id = _purchase_id
    AND entry_type = 'sale'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'sale_ledger_missing';
  END IF;

  SELECT
    COALESCE(sum(-gross_cents), 0)::integer,
    COALESCE(sum(platform_fee_cents), 0)::integer,
    COALESCE(sum(creator_net_cents), 0)::integer,
    COALESCE(sum(rev_share_surcharge_cents), 0)::integer
  INTO
    v_prior_refund_gross,
    v_prior_refund_fee,
    v_prior_refund_net,
    v_prior_refund_surcharge
  FROM public.creator_earnings_ledger
  WHERE purchase_id = _purchase_id
    AND entry_type = 'refund';

  -- Historical environments may already contain one generic full-refund row.
  -- Treat it as terminal rather than creating a duplicate event.
  IF v_prior_refund_gross >= v_sale.gross_cents THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'legacy_full_refund', true,
      'refunded_total_cents', v_prior_refund_gross,
      'remaining_cents', 0,
      'fully_refunded', true
    );
  END IF;

  IF v_prior_refund_gross + _refund_amount_cents > v_sale.gross_cents THEN
    RAISE EXCEPTION
      'refund_exceeds_purchase: already_refunded=% requested=% gross=%',
      v_prior_refund_gross,
      _refund_amount_cents,
      v_sale.gross_cents;
  END IF;

  v_refunded_after := v_prior_refund_gross + _refund_amount_cents;
  v_fully_refunded := v_refunded_after = v_sale.gross_cents;

  IF v_fully_refunded THEN
    -- Use the exact remaining original amounts on the final refund so rounding
    -- across multiple partial refunds always sums to a perfect full reversal.
    v_fee_to_reverse := v_sale.platform_fee_cents + v_prior_refund_fee;
    v_net_to_reverse := v_sale.creator_net_cents + v_prior_refund_net;
    v_surcharge_to_reverse :=
      v_sale.rev_share_surcharge_cents + v_prior_refund_surcharge;
  ELSE
    v_fee_to_reverse := (
      v_sale.platform_fee_cents::numeric
      * _refund_amount_cents
      / NULLIF(v_sale.gross_cents, 0)
    )::integer;
    v_net_to_reverse := _refund_amount_cents - v_fee_to_reverse;
    v_surcharge_to_reverse := (
      v_sale.rev_share_surcharge_cents::numeric
      * _refund_amount_cents
      / NULLIF(v_sale.gross_cents, 0)
    )::integer;
  END IF;

  INSERT INTO public.creator_earnings_ledger (
    purchase_id,
    creator_user_id,
    book_id,
    listing_id,
    entry_type,
    gross_cents,
    platform_fee_cents,
    creator_net_cents,
    fee_bps_applied,
    currency,
    base_currency,
    payout_status,
    book_title_snapshot,
    creator_display_name_snapshot,
    listing_slug_snapshot,
    occurred_at,
    metadata,
    rev_share_surcharge_bps,
    rev_share_surcharge_cents,
    source_event_id
  )
  VALUES (
    _purchase_id,
    v_sale.creator_user_id,
    v_sale.book_id,
    v_sale.listing_id,
    'refund',
    -_refund_amount_cents,
    -v_fee_to_reverse,
    -v_net_to_reverse,
    v_sale.fee_bps_applied,
    v_sale.currency,
    v_sale.base_currency,
    'void',
    v_sale.book_title_snapshot,
    v_sale.creator_display_name_snapshot,
    v_sale.listing_slug_snapshot,
    now(),
    jsonb_build_object(
      'source', 'record_purchase_refund_ledger',
      'refund_event_id', _refund_event_id,
      'refund_amount_cents', _refund_amount_cents,
      'refunded_total_cents', v_refunded_after,
      'fully_refunded', v_fully_refunded
    ),
    v_sale.rev_share_surcharge_bps,
    -v_surcharge_to_reverse,
    _refund_event_id
  )
  RETURNING id INTO v_refund_ledger_id;

  INSERT INTO public.creator_revenue_daily (
    creator_user_id,
    book_id,
    day,
    currency,
    gross_cents,
    platform_fee_cents,
    net_cents,
    refund_cents,
    refund_count
  )
  VALUES (
    v_sale.creator_user_id,
    v_sale.book_id,
    v_refund_day,
    v_sale.currency,
    -_refund_amount_cents,
    -v_fee_to_reverse,
    -v_net_to_reverse,
    _refund_amount_cents,
    1
  )
  ON CONFLICT (creator_user_id, book_id, day, currency)
  DO UPDATE SET
    gross_cents = creator_revenue_daily.gross_cents + EXCLUDED.gross_cents,
    platform_fee_cents = creator_revenue_daily.platform_fee_cents + EXCLUDED.platform_fee_cents,
    net_cents = creator_revenue_daily.net_cents + EXCLUDED.net_cents,
    refund_cents = creator_revenue_daily.refund_cents + EXCLUDED.refund_cents,
    refund_count = creator_revenue_daily.refund_count + 1,
    updated_at = now();

  IF v_fully_refunded THEN
    UPDATE public.book_purchases
    SET status = 'refunded'
    WHERE id = _purchase_id
      AND status <> 'refunded';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'ledger_id', v_refund_ledger_id,
    'refund_event_id', _refund_event_id,
    'refund_amount_cents', _refund_amount_cents,
    'refunded_total_cents', v_refunded_after,
    'remaining_cents', v_sale.gross_cents - v_refunded_after,
    'fully_refunded', v_fully_refunded
  );
END
$$;

REVOKE ALL ON FUNCTION public.record_purchase_refund_ledger(uuid, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_purchase_refund_ledger(uuid, text, integer)
  TO service_role;
