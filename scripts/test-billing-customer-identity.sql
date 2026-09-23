\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_user_a uuid := '95000000-0000-4000-8000-000000000001';
  v_user_b uuid := '95000000-0000-4000-8000-000000000002';
  v_count integer;
BEGIN
  IF to_regclass('public.billing_customer_links') IS NULL THEN
    RAISE EXCEPTION 'billing_customer_links table is missing';
  END IF;

  IF has_table_privilege('anon', 'public.billing_customer_links', 'SELECT')
     OR has_table_privilege('anon', 'public.billing_customer_links', 'INSERT')
     OR has_table_privilege('anon', 'public.billing_customer_links', 'UPDATE')
     OR has_table_privilege('anon', 'public.billing_customer_links', 'DELETE')
     OR has_table_privilege('authenticated', 'public.billing_customer_links', 'SELECT')
     OR has_table_privilege('authenticated', 'public.billing_customer_links', 'INSERT')
     OR has_table_privilege('authenticated', 'public.billing_customer_links', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.billing_customer_links', 'DELETE') THEN
    RAISE EXCEPTION 'browser role can access billing customer identity';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.billing_customer_links', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.billing_customer_links', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.billing_customer_links', 'UPDATE')
     OR NOT has_table_privilege('service_role', 'public.billing_customer_links', 'DELETE') THEN
    RAISE EXCEPTION 'service_role lacks billing customer identity authority';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'billing_customer_links'
      AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'billing_customer_links RLS is disabled';
  END IF;

  INSERT INTO auth.users(
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  )
  VALUES
    (
      v_user_a,
      '00000000-0000-0000-0000-000000000000',
      'authenticated','authenticated','billing-a@example.test','x',
      now(),now(),now(),'{}'::jsonb,'{}'::jsonb
    ),
    (
      v_user_b,
      '00000000-0000-0000-0000-000000000000',
      'authenticated','authenticated','billing-b@example.test','x',
      now(),now(),now(),'{}'::jsonb,'{}'::jsonb
    );

  INSERT INTO public.billing_customer_links(
    user_id, stripe_customer_id, source
  )
  VALUES(v_user_a, 'cus_E2EA0000001', 'fixture');

  BEGIN
    INSERT INTO public.billing_customer_links(
      user_id, stripe_customer_id, source
    )
    VALUES(v_user_a, 'cus_E2EA0000002', 'fixture');
    RAISE EXCEPTION 'one user accepted two Stripe customers';
  EXCEPTION
    WHEN unique_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.billing_customer_links(
      user_id, stripe_customer_id, source
    )
    VALUES(v_user_b, 'cus_E2EA0000001', 'fixture');
    RAISE EXCEPTION 'one Stripe customer accepted two users';
  EXCEPTION
    WHEN unique_violation THEN NULL;
  END;

  DELETE FROM auth.users WHERE id = v_user_a;

  SELECT count(*) INTO v_count
  FROM public.billing_customer_links
  WHERE user_id = v_user_a;

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'billing customer link did not cascade on auth-user deletion';
  END IF;
END
$$;

ROLLBACK;

SELECT 'Canonical billing customer identity: PASS' AS result;
