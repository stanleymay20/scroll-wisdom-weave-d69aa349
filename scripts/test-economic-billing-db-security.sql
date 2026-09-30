\set ON_ERROR_STOP on

-- Browser roles must not mutate billing meters or financial orders.
DO $$
BEGIN
  IF has_table_privilege('anon', 'public.billing_usage_monthly', 'INSERT')
     OR has_table_privilege('authenticated', 'public.billing_usage_monthly', 'INSERT')
     OR has_table_privilege('authenticated', 'public.billing_usage_monthly', 'UPDATE')
     OR has_table_privilege('anon', 'public.billing_orders', 'INSERT')
     OR has_table_privilege('authenticated', 'public.billing_orders', 'INSERT')
     OR has_table_privilege('authenticated', 'public.billing_orders', 'UPDATE') THEN
    RAISE EXCEPTION 'browser role can mutate economic billing authority';
  END IF;
END
$$;

-- Meter/order mutation RPCs are service-role only.
DO $$
DECLARE
  fn regprocedure;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.reserve_billing_usage(uuid,text,text,bigint,bigint)'::regprocedure,
    'public.release_billing_usage(uuid,text,text,bigint)'::regprocedure,
    'public.grant_billing_usage_addon(uuid,text,text,bigint)'::regprocedure,
    'public.settle_billing_order(uuid,text,text,text)'::regprocedure,
    'public.fail_billing_order(uuid,text)'::regprocedure,
    'public.record_billing_order_refund(uuid,text,integer)'::regprocedure
  ]
  LOOP
    IF has_function_privilege('anon', fn, 'EXECUTE')
       OR has_function_privilege('authenticated', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'browser role can execute billing mutation RPC %', fn;
    END IF;
    IF NOT has_function_privilege('service_role', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'service role cannot execute billing mutation RPC %', fn;
    END IF;
  END LOOP;
END
$$;

-- The browser may only read its own usage/orders through RLS.
DO $$
BEGIN
  IF NOT has_table_privilege('authenticated', 'public.billing_usage_monthly', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.billing_orders', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated user cannot read own billing state';
  END IF;
END
$$;

-- Financial order settlement must not reference ISBN mint/allocation routines.
DO $$
DECLARE
  body text;
BEGIN
  SELECT pg_get_functiondef('public.settle_billing_order(uuid,text,text,text)'::regprocedure)
  INTO body;

  IF body ~* 'isbn_inventory|allocate.*isbn|mint.*isbn|assign.*isbn' THEN
    RAISE EXCEPTION 'billing settlement must not allocate ISBN inventory';
  END IF;
END
$$;


-- Paying for a publishing service must never allocate an ISBN.
DO $$
DECLARE
  v_user uuid := gen_random_uuid();
  v_order uuid;
  before_count bigint;
  after_count bigint;
  result jsonb;
BEGIN
  SELECT count(*) INTO before_count FROM public.isbn_inventory;

  INSERT INTO public.billing_orders (
    user_id, kind, sku, benefit_month, expected_amount_cents, currency,
    stripe_customer_id, stripe_session_id
  )
  VALUES (
    v_user, 'publishing_service', 'single_edition',
    to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM'),
    4900, 'usd', 'cus_test_billing_order', 'cs_test_billing_order'
  )
  RETURNING id INTO v_order;

  result := public.settle_billing_order(
    v_order,
    'cs_test_billing_order',
    'pi_test_billing_order',
    'cus_test_billing_order'
  );

  IF COALESCE((result->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'publishing service order did not settle';
  END IF;

  SELECT count(*) INTO after_count FROM public.isbn_inventory;
  IF after_count <> before_count THEN
    RAISE EXCEPTION 'publishing service payment changed ISBN inventory';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.billing_orders
    WHERE id = v_order AND status = 'paid' AND fulfilled_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'publishing service order was not durably fulfilled';
  END IF;
END
$$;
