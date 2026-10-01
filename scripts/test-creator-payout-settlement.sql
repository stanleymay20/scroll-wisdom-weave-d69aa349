BEGIN;
SET LOCAL client_min_messages TO NOTICE;

DO $$
DECLARE
  v_creator uuid := '11111111-1111-4111-8111-111111111111';
  v_creator_unverified uuid := '22222222-2222-4222-8222-222222222222';
  v_sale_purchase uuid := '33333333-3333-4333-8333-333333333333';
  v_refund_purchase uuid := '44444444-4444-4444-8444-444444444444';
  v_new_sale_purchase uuid := '55555555-5555-4555-8555-555555555555';
  v_unverified_purchase uuid := '66666666-6666-4666-8666-666666666666';
  v_book uuid := '77777777-7777-4777-8777-777777777777';
  v_first jsonb;
  v_second jsonb;
  v_third jsonb;
  v_retry jsonb;
  v_unverified jsonb;
  v_first_id uuid;
  v_third_id uuid;
  v_retry_id uuid;
  v_balance record;
  v_alloc_count integer;
BEGIN
  INSERT INTO public.creator_payout_profiles (
    user_id,payout_method,stripe_connect_account_id,stripe_connect_status,country_code
  ) VALUES
    (v_creator,'stripe_connect','acct_test_verified','verified','DE'),
    (v_creator_unverified,'stripe_connect','acct_test_pending','pending','DE');

  INSERT INTO public.creator_earnings_ledger (
    purchase_id,creator_user_id,book_id,entry_type,
    gross_cents,platform_fee_cents,creator_net_cents,fee_bps_applied,
    currency,payout_status,available_at,occurred_at
  ) VALUES
    (v_sale_purchase,v_creator,v_book,'sale',
      10000,1500,8500,1500,'usd','pending',now()-interval '1 day',now()-interval '15 days'),
    (v_refund_purchase,v_creator,v_book,'refund',
      -2000,-300,-1700,1500,'usd','void',NULL,now()-interval '1 hour');

  v_first := public.reserve_creator_payout(v_creator,'USD',100);
  IF COALESCE((v_first->>'ok')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'first payout reservation failed: %', v_first;
  END IF;
  IF (v_first->>'amount_cents')::integer <> 6800 THEN
    RAISE EXCEPTION 'unexpected first payout amount: %', v_first;
  END IF;
  IF COALESCE((v_first->>'reused')::boolean,false) IS TRUE THEN
    RAISE EXCEPTION 'first reservation was unexpectedly reused: %', v_first;
  END IF;
  v_first_id := (v_first->>'payout_transfer_id')::uuid;

  SELECT count(*) INTO v_alloc_count
  FROM public.creator_payout_allocations
  WHERE payout_transfer_id = v_first_id;
  IF v_alloc_count <> 2 THEN
    RAISE EXCEPTION 'expected two ledger allocations, got %', v_alloc_count;
  END IF;

  v_second := public.reserve_creator_payout(v_creator,'usd',100);
  IF COALESCE((v_second->>'reused')::boolean,false) IS NOT TRUE
     OR (v_second->>'payout_transfer_id')::uuid <> v_first_id THEN
    RAISE EXCEPTION 'concurrent/retry reservation did not reuse active payout: %', v_second;
  END IF;

  PERFORM public.mark_creator_payout_transferred(v_first_id,'tr_test_first');

  SELECT * INTO v_balance
  FROM public.get_creator_payout_balance(v_creator)
  WHERE currency='usd';

  IF v_balance.eligible_cents <> 6800
     OR v_balance.transferred_cents <> 6800
     OR v_balance.reserved_cents <> 0
     OR v_balance.payable_cents <> 0 THEN
    RAISE EXCEPTION 'unexpected post-transfer balance: eligible %, transferred %, reserved %, payable %',
      v_balance.eligible_cents,v_balance.transferred_cents,v_balance.reserved_cents,v_balance.payable_cents;
  END IF;

  INSERT INTO public.creator_earnings_ledger (
    purchase_id,creator_user_id,book_id,entry_type,
    gross_cents,platform_fee_cents,creator_net_cents,fee_bps_applied,
    currency,payout_status,available_at,occurred_at
  ) VALUES (
    v_new_sale_purchase,v_creator,v_book,'sale',
    6000,1000,5000,1667,'usd','pending',now()-interval '1 second',now()-interval '15 days'
  );

  v_third := public.reserve_creator_payout(v_creator,'usd',100);
  IF (v_third->>'amount_cents')::integer <> 5000 THEN
    RAISE EXCEPTION 'new matured sale did not produce 5000 payout: %', v_third;
  END IF;
  v_third_id := (v_third->>'payout_transfer_id')::uuid;

  PERFORM public.mark_creator_payout_failed(v_third_id,'insufficient_funds','test failure');

  v_retry := public.reserve_creator_payout(v_creator,'usd',100);
  IF COALESCE((v_retry->>'ok')::boolean,false) IS NOT TRUE
     OR COALESCE((v_retry->>'reused')::boolean,false) IS TRUE
     OR (v_retry->>'amount_cents')::integer <> 5000 THEN
    RAISE EXCEPTION 'failed transfer was not safely reservable again: %', v_retry;
  END IF;
  v_retry_id := (v_retry->>'payout_transfer_id')::uuid;
  IF v_retry_id = v_third_id THEN
    RAISE EXCEPTION 'retry unexpectedly reused failed payout id';
  END IF;

  INSERT INTO public.creator_earnings_ledger (
    purchase_id,creator_user_id,book_id,entry_type,
    gross_cents,platform_fee_cents,creator_net_cents,fee_bps_applied,
    currency,payout_status,available_at,occurred_at
  ) VALUES (
    v_unverified_purchase,v_creator_unverified,v_book,'sale',
    1000,150,850,1500,'usd','pending',now()-interval '1 day',now()-interval '15 days'
  );
  v_unverified := public.reserve_creator_payout(v_creator_unverified,'usd',100);
  IF COALESCE(v_unverified->>'reason','') <> 'creator_not_payout_ready' THEN
    RAISE EXCEPTION 'unverified creator was payout-eligible: %', v_unverified;
  END IF;

  IF has_function_privilege('authenticated','public.reserve_creator_payout(uuid,text,integer)','EXECUTE') THEN
    RAISE EXCEPTION 'authenticated can execute reserve_creator_payout';
  END IF;
  IF has_function_privilege('authenticated','public.mark_creator_payout_transferred(uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'authenticated can execute mark_creator_payout_transferred';
  END IF;
  IF has_function_privilege('authenticated','public.mark_creator_payout_failed(uuid,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'authenticated can execute mark_creator_payout_failed';
  END IF;
  IF has_table_privilege('authenticated','public.creator_payout_transfers','SELECT') THEN
    RAISE EXCEPTION 'authenticated can directly read creator_payout_transfers';
  END IF;
  IF has_table_privilege('authenticated','public.creator_payout_allocations','SELECT') THEN
    RAISE EXCEPTION 'authenticated can directly read creator_payout_allocations';
  END IF;

  RAISE NOTICE 'CREATOR PAYOUT SETTLEMENT ASSERTIONS PASSED';
END
$$;

ROLLBACK;
