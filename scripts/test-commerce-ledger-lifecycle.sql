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
  v_status text;
  v_sale record;
  v_refund record;
  v_rollup record;
BEGIN
  -- Both money writers are privileged server boundaries.
  IF has_function_privilege('anon', 'public.record_purchase_ledger(uuid)'::regprocedure, 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.record_purchase_ledger(uuid)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'browser role can execute record_purchase_ledger';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.record_purchase_ledger(uuid)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role cannot execute record_purchase_ledger';
  END IF;

  IF has_function_privilege('anon', 'public.record_purchase_refund_ledger(uuid,text,integer)'::regprocedure, 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.record_purchase_refund_ledger(uuid,text,integer)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'browser role can execute record_purchase_refund_ledger';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.record_purchase_refund_ledger(uuid,text,integer)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role cannot execute record_purchase_refund_ledger';
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

  -- No creator_entitlements row means the canonical free-creator economics:
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

  -- At-least-once sale webhook replay must never double-credit.
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

  -- First partial refund: access remains because only 33.33% was returned.
  v_result := public.record_purchase_refund_ledger(
    v_purchase, 're_partial_1', 3333
  );
  IF COALESCE((v_result->>'ok')::boolean, false) IS NOT TRUE
     OR COALESCE((v_result->>'fully_refunded')::boolean, true) IS NOT FALSE
     OR (v_result->>'remaining_cents')::integer <> 6667 THEN
    RAISE EXCEPTION 'first partial refund result wrong: %', v_result;
  END IF;

  SELECT status INTO STRICT v_status
  FROM public.book_purchases WHERE id = v_purchase;
  IF v_status <> 'paid' THEN
    RAISE EXCEPTION 'partial refund revoked purchase access early: status=%', v_status;
  END IF;
  IF public.user_owns_book_purchase(v_buyer, v_book) IS NOT TRUE THEN
    RAISE EXCEPTION 'partial refund removed buyer entitlement';
  END IF;

  SELECT * INTO STRICT v_refund
  FROM public.creator_earnings_ledger
  WHERE source_event_id = 're_partial_1';

  IF v_refund.gross_cents <> -3333
     OR v_refund.platform_fee_cents <> -833
     OR v_refund.creator_net_cents <> -2500
     OR v_refund.rev_share_surcharge_cents <> -333 THEN
    RAISE EXCEPTION
      'first partial refund arithmetic wrong: gross=%, fee=%, net=%, surcharge=%',
      v_refund.gross_cents,
      v_refund.platform_fee_cents,
      v_refund.creator_net_cents,
      v_refund.rev_share_surcharge_cents;
  END IF;

  -- Same Stripe refund ID is an idempotent replay, not a second reversal.
  v_result := public.record_purchase_refund_ledger(
    v_purchase, 're_partial_1', 3333
  );
  IF COALESCE((v_result->>'idempotent')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'refund replay was not reported idempotent: %', v_result;
  END IF;
  SELECT count(*) INTO v_count
  FROM public.creator_earnings_ledger
  WHERE purchase_id = v_purchase AND entry_type = 'refund';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'refund replay created duplicate ledger row; rows=%', v_count;
  END IF;

  -- An event cannot refund more than the unrefunded balance.
  BEGIN
    PERFORM public.record_purchase_refund_ledger(
      v_purchase, 're_over_refund', 7000
    );
    RAISE EXCEPTION 'over-refund unexpectedly succeeded';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM = 'over-refund unexpectedly succeeded'
         OR position('refund_exceeds_purchase' IN SQLERRM) = 0 THEN
        RAISE;
      END IF;
  END;

  -- Second partial refund still preserves access.
  v_result := public.record_purchase_refund_ledger(
    v_purchase, 're_partial_2', 3333
  );
  IF COALESCE((v_result->>'fully_refunded')::boolean, true) IS NOT FALSE
     OR (v_result->>'remaining_cents')::integer <> 3334 THEN
    RAISE EXCEPTION 'second partial refund result wrong: %', v_result;
  END IF;
  IF public.user_owns_book_purchase(v_buyer, v_book) IS NOT TRUE THEN
    RAISE EXCEPTION 'second partial refund removed buyer entitlement';
  END IF;

  -- Final refund uses exact remaining fee/net/surcharge to absorb rounding.
  v_result := public.record_purchase_refund_ledger(
    v_purchase, 're_partial_3', 3334
  );
  IF COALESCE((v_result->>'fully_refunded')::boolean, false) IS NOT TRUE
     OR (v_result->>'remaining_cents')::integer <> 0
     OR (v_result->>'refunded_total_cents')::integer <> 10000 THEN
    RAISE EXCEPTION 'final refund result wrong: %', v_result;
  END IF;

  SELECT status INTO STRICT v_status
  FROM public.book_purchases WHERE id = v_purchase;
  IF v_status <> 'refunded' THEN
    RAISE EXCEPTION 'fully refunded purchase did not transition to refunded: %', v_status;
  END IF;
  IF public.user_owns_book_purchase(v_buyer, v_book) IS TRUE THEN
    RAISE EXCEPTION 'fully refunded buyer retained paid purchase entitlement';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.creator_earnings_ledger
  WHERE purchase_id = v_purchase AND entry_type = 'refund';
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'expected three append-only refund events, got %', v_count;
  END IF;

  -- The legacy sale writer remains sale-only even after status becomes refunded.
  PERFORM public.record_purchase_ledger(v_purchase);
  SELECT count(*) INTO v_count
  FROM public.creator_earnings_ledger
  WHERE purchase_id = v_purchase AND entry_type = 'refund';
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'sale writer created a generic refund row after migration';
  END IF;

  SELECT
    sum(gross_cents) AS gross,
    sum(platform_fee_cents) AS fee,
    sum(creator_net_cents) AS net,
    sum(rev_share_surcharge_cents) AS surcharge
  INTO STRICT v_rollup
  FROM public.creator_earnings_ledger
  WHERE purchase_id = v_purchase;

  IF v_rollup.gross <> 0
     OR v_rollup.fee <> 0
     OR v_rollup.net <> 0
     OR v_rollup.surcharge <> 0 THEN
    RAISE EXCEPTION
      'sale + partial refunds did not fully reverse: gross=%, fee=%, net=%, surcharge=%',
      v_rollup.gross, v_rollup.fee, v_rollup.net, v_rollup.surcharge;
  END IF;

  -- Daily economics are also neutral after the three same-day refund events.
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
     OR v_rollup.refunds <> 3
     OR v_rollup.refund_cents <> 10000 THEN
    RAISE EXCEPTION
      'daily partial-refund reconciliation wrong: gross=%, fee=%, net=%, sales=%, refunds=%, refund_cents=%',
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
