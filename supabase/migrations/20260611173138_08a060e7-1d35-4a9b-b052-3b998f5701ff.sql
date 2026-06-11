
-- ============================================================
-- M2: Dual-write book_purchases → purchases (mirror trigger)
-- ============================================================

CREATE OR REPLACE FUNCTION public.mirror_book_purchase_to_universal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_asset_id uuid;
  v_creator_user_id uuid;
  v_purchase_id uuid;
  v_first_paid boolean := false;
  v_status text;
  v_refunded_at timestamptz;
  v_is_backfill boolean := false;
BEGIN
  -- Resolve the asset and creator for this book (created in M1 backfill).
  SELECT ca.id, ca.creator_user_id
    INTO v_asset_id, v_creator_user_id
    FROM public.creator_assets ca
    WHERE ca.source_book_id = NEW.book_id
    LIMIT 1;

  -- If the asset row doesn't exist (e.g., a book added post-M1 backfill),
  -- create one lazily so the dual-write never fails silently.
  IF v_asset_id IS NULL THEN
    INSERT INTO public.creator_assets (creator_user_id, asset_type, source_book_id, status, title)
    SELECT b.user_id, 'book', b.id, 'live', COALESCE(b.title, 'Untitled')
      FROM public.books b
      WHERE b.id = NEW.book_id
    ON CONFLICT (source_book_id) DO UPDATE SET source_book_id = EXCLUDED.source_book_id
    RETURNING id, creator_user_id INTO v_asset_id, v_creator_user_id;
  END IF;

  v_status := COALESCE(NEW.status, 'pending');
  v_refunded_at := CASE WHEN v_status = 'refunded' THEN COALESCE(NEW.updated_at, now()) ELSE NULL END;
  v_is_backfill := COALESCE((NEW.metadata->>'backfilled')::boolean, false);

  -- Detect transition into 'paid' for business event emission.
  IF TG_OP = 'INSERT' THEN
    v_first_paid := (v_status = 'paid');
  ELSIF TG_OP = 'UPDATE' THEN
    v_first_paid := (v_status = 'paid' AND COALESCE(OLD.status, '') <> 'paid');
  END IF;

  -- Upsert mirror row.
  INSERT INTO public.purchases (
    user_id, buyer_email, creator_user_id, asset_id, asset_type_snapshot,
    pricing_model, amount_cents, currency, status,
    stripe_session_id, stripe_payment_intent_id,
    purchased_at, refunded_at, source_book_purchase_id,
    correlation_id, metadata
  ) VALUES (
    NEW.buyer_user_id, NEW.buyer_email, v_creator_user_id, v_asset_id, 'book',
    'one_time', COALESCE(NEW.amount_cents, 0), COALESCE(NEW.currency, 'usd'), v_status,
    NEW.stripe_session_id, NEW.stripe_payment_intent,
    NEW.purchased_at, v_refunded_at, NEW.id,
    NEW.correlation_id,
    COALESCE(NEW.metadata, '{}'::jsonb) || jsonb_build_object('mirror_source', 'book_purchases')
  )
  ON CONFLICT (source_book_purchase_id) WHERE source_book_purchase_id IS NOT NULL
  DO UPDATE SET
    user_id = EXCLUDED.user_id,
    buyer_email = EXCLUDED.buyer_email,
    creator_user_id = EXCLUDED.creator_user_id,
    asset_id = EXCLUDED.asset_id,
    amount_cents = EXCLUDED.amount_cents,
    currency = EXCLUDED.currency,
    status = EXCLUDED.status,
    stripe_session_id = COALESCE(EXCLUDED.stripe_session_id, public.purchases.stripe_session_id),
    stripe_payment_intent_id = COALESCE(EXCLUDED.stripe_payment_intent_id, public.purchases.stripe_payment_intent_id),
    purchased_at = COALESCE(EXCLUDED.purchased_at, public.purchases.purchased_at),
    refunded_at = COALESCE(EXCLUDED.refunded_at, public.purchases.refunded_at),
    correlation_id = COALESCE(EXCLUDED.correlation_id, public.purchases.correlation_id),
    metadata = public.purchases.metadata || EXCLUDED.metadata,
    updated_at = now()
  RETURNING id INTO v_purchase_id;

  -- Emit purchase_completed business event on first transition to paid,
  -- but never for backfilled historical rows (per M1/M2 plan).
  IF v_first_paid AND NOT v_is_backfill AND v_purchase_id IS NOT NULL THEN
    INSERT INTO public.creator_business_events (
      creator_user_id, asset_id, purchase_id, event_type, metadata
    ) VALUES (
      v_creator_user_id, v_asset_id, v_purchase_id, 'purchase_completed',
      jsonb_build_object(
        'asset_type', 'book',
        'amount_cents', COALESCE(NEW.amount_cents, 0),
        'currency', COALESCE(NEW.currency, 'usd'),
        'source', 'mirror_trigger'
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mirror_book_purchase_to_universal ON public.book_purchases;
CREATE TRIGGER trg_mirror_book_purchase_to_universal
AFTER INSERT OR UPDATE ON public.book_purchases
FOR EACH ROW EXECUTE FUNCTION public.mirror_book_purchase_to_universal();

-- ============================================================
-- M2: Asset ledger writer (reserved for non-book asset types).
-- Books continue to use record_purchase_ledger() unchanged.
-- ============================================================

CREATE OR REPLACE FUNCTION public.record_asset_purchase_ledger(_purchase_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.purchases%ROWTYPE;
BEGIN
  SELECT * INTO p FROM public.purchases WHERE id = _purchase_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'purchase % not found', _purchase_id;
  END IF;

  -- Book purchases still flow through the existing book ledger path
  -- (record_purchase_ledger reads book_purchases). Skip them here so we
  -- never double-write the ledger during the staged migration.
  IF p.asset_type_snapshot = 'book' OR p.source_book_purchase_id IS NOT NULL THEN
    RETURN;
  END IF;

  -- Placeholder: non-book ledger writes land in M3+ when those asset
  -- types ship. We intentionally leave this as a safe no-op for now so
  -- callers can already wire it in without changing behaviour.
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.record_asset_purchase_ledger(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_asset_purchase_ledger(uuid) TO service_role;
