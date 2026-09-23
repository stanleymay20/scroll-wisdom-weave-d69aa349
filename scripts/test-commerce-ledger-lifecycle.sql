\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_creator uuid := '91000000-0000-4000-8000-000000000001';
  v_buyer uuid := '91000000-0000-4000-8000-000000000002';
  v_book uuid;
  v_listing uuid;
  v_purchase uuid;
  v_result jsonb;
  v_count integer;
  v_sale record;
  v_refund record;
  v_rollup record;
BEGIN
  -- This writer is a privileged money boundary. Browser roles must never call it.
  IF has_function_privilege('anon', 'public.record_purchase_ledger(uuid)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute record_purchase_ledger';
  END IF;
  IF has_function_privilege('authenticated', 'public.record_purchase_ledger(uuid)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated can execute record_purchase_ledger';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.record_purchase_ledger(uuid)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role cannot execute record_purchase_ledger';
  END IF;

  INSERT INTO public.books (user_id, title, category)
  VALUES (v_creator, 'Commerce Ledger Fixture', 'non_fiction')
  RETURNING id INTO v_book;

  INSERT INTO public.public_listings (
    book_id, slug, is_public, price_cents, currency, sample_chapters
  )
  VALUES (
    v_book,
    'commerce-ledger-fixture-' || replace(v_book::text, '-', ''),
    true,
    10000,
    'usd',
    1
  )
  RETURNING id INTO v_listing;

  -- No entitlement row means the creator is on the canonical free creator tier:
  -- 15% platform fee + 10% free-tier revenue-share surcharge.
  INSERT INTO public.book_purchases (
    listing_id, book_id, buyer_user_id, buyer_email,
    amount_cents, currency, status, purchased_at,
    stripe_session_id, stripe_payment_intent
  )
  VALUES (
    v_listing, v_book, v_buyer, 'ledger-fixture@example.test',
    10000, 'usd', 'paid', now(),
    'cs_test_ledger_fixture_' || replace(v_book::text, '-', ''),
    'pi_test_ledger_fixture_' || replace(v_book::text, '-', '')
  )
  RETURNING id INTO v_purchase;

  v_result := public.record_purchase_ledger(v_purchase);
  IF COALESCE((v_result->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'sale ledger writer returned non-ok: %', v_result;
  END IF;
  IF (v_result->>'fee_bps')::integer <> 1500 THEN
    RAISE EXCEPTION 'unexpected base platform fee bps: %', v_result;
  END IF;
  IF (v_result->>'surcharge_bps')::integer <> 1000 THEN
    RAISE EXCEPTION 'unexpected free creator surcharge bps: %', v_result;
  END IF;

  SELECT * INTO STRICT v_sale
  FROM public.creator_earnings_ledger
  WHERE purchase_id = v_purchase AND entry_type = 'sale';

  IF v_sale.gross_cents <> 10000
     OR v_sale.platform_fee_cents <> 2500
     OR v_sale.creator_net_cents <> 7500
     OR v_sale.rev_share_surcharge_bps <> 1000
     OR v_sale.rev_share_surcharge_cents <> 1000 THEN
    RAISE EXCEPTION
      'sale ledger arithmetic wrong: gross=%, fee=%, net=%, surcharge_bps=%, surcharge_cents=%',
      v_sale.gross_cents,
      v_sale.platform_fee_cents,
      v_sale.creator_net_cents,
      v_sale.rev_share_surcharge_bps,
      v_sale.rev_share_surcharge_cents;
  END IF;

  -- Webhooks are at-least-once. A replay must never double-credit the creator.
  PERFORM public.record_purchase_ledger(v_purchase);
  SELECT count(*) INTO v_count
  FROM public.creator_earnings_ledger
  WHERE purchase_id = v_purchase AND entry_type = 'sale';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'sale replay was not idempotent; rows=%', v_count;
  END IF;

  IF public.user_owns_book_purchase(v_buyer, v_book) IS NOT TRUE THEN
    RAISE EXCEPTION 'paid buyer did not receive purchase entitlement';
  END IF;

  UPDATE public.book_purchases
  SET status = 'refunded'
  WHERE id = v_purchase;

  v_result := public.record_purchase_ledger(v_purchase);
  IF COALESCE((v_result->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'refund ledger writer returned non-ok: %', v_result;
  END IF;

  SELECT * INTO STRICT v_refund
  FROM public.creator_earnings_ledger
  WHERE purchase_id = v_purchase AND entry_type = 'refund';

  IF v_refund.gross_cents <> -10000
     OR v_refund.platform_fee_cents <> -2500
     OR v_refund.creator_net_cents <> -7500
     OR v_refund.rev_share_surcharge_bps <> 1000
     OR v_refund.rev_share_surcharge_cents <> -1000 THEN
    RAISE EXCEPTION
      'refund reversal arithmetic wrong: gross=%, fee=%, net=%, surcharge_bps=%, surcharge_cents=%',
      v_refund.gross_cents,
      v_refund.platform_fee_cents,
      v_refund.creator_net_cents,
      v_refund.rev_share_surcharge_bps,
      v_refund.rev_share_surcharge_cents;
  END IF;

  -- Refund webhook/admin retries must not create a second reversal.
  PERFORM public.record_purchase_ledger(v_purchase);
  SELECT count(*) INTO v_count
  FROM public.creator_earnings_ledger
  WHERE purchase_id = v_purchase AND entry_type = 'refund';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'refund replay was not idempotent; rows=%', v_count;
  END IF;

  SELECT
    sum(gross_cents) AS gross,
    sum(platform_fee_cents) AS fee,
    sum(creator_net_cents) AS net
  INTO STRICT v_rollup
  FROM public.creator_earnings_ledger
  WHERE purchase_id = v_purchase;

  IF v_rollup.gross <> 0 OR v_rollup.fee <> 0 OR v_rollup.net <> 0 THEN
    RAISE EXCEPTION
      'sale + refund did not fully reverse: gross=%, fee=%, net=%',
      v_rollup.gross, v_rollup.fee, v_rollup.net;
  END IF;

  IF public.user_owns_book_purchase(v_buyer, v_book) IS TRUE THEN
    RAISE EXCEPTION 'refunded buyer retained paid purchase entitlement';
  END IF;

  -- Daily revenue must also be economically neutral after same-day refund.
  SELECT
    sum(gross_cents) AS gross,
    sum(platform_fee_cents) AS fee,
    sum(net_cents) AS net,
    sum(sales_count) AS sales,
    sum(refund_count) AS refunds,
    sum(refund_cents) AS refund_cents
  INTO STRICT v_rollup
  FROM public.creator_revenue_daily
  WHERE creator_user_id = v_creator AND book_id = v_book;

  IF v_rollup.gross <> 0
     OR v_rollup.fee <> 0
     OR v_rollup.net <> 0
     OR v_rollup.sales <> 1
     OR v_rollup.refunds <> 1
     OR v_rollup.refund_cents <> 10000 THEN
    RAISE EXCEPTION
      'daily revenue reversal wrong: gross=%, fee=%, net=%, sales=%, refunds=%, refund_cents=%',
      v_rollup.gross,
      v_rollup.fee,
      v_rollup.net,
      v_rollup.sales,
      v_rollup.refunds,
      v_rollup.refund_cents;
  END IF;
END
$$;

ROLLBACK;
