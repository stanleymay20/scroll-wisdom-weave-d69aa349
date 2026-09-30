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
