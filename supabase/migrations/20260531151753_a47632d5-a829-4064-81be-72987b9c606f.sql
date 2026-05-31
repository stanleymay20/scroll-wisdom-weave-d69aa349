-- Grant top-tier subscription + full external publishing entitlements to Stanley Osei-Wusu
DO $$
DECLARE
  uid uuid := '607b86cf-c9cd-4ce3-bf4a-e60e6da09fcf';
BEGIN
  -- Subscription: premium/prophet tier, active, far-future period end
  INSERT INTO public.subscriptions (user_id, tier, status, current_period_start, current_period_end)
  VALUES (uid, 'prophet', 'active', now(), now() + interval '100 years')
  ON CONFLICT (user_id) DO UPDATE
    SET tier = EXCLUDED.tier,
        status = EXCLUDED.status,
        current_period_start = EXCLUDED.current_period_start,
        current_period_end = EXCLUDED.current_period_end,
        updated_at = now();

  -- Creator entitlements: max tier + all publishing capabilities
  INSERT INTO public.creator_entitlements (
    user_id, tier,
    can_publish_external, can_schedule_releases, can_use_collections_unlimited,
    priority_generation, monthly_generation_bonus, rev_share_surcharge_bps,
    source, payment_status, current_period_end, granted_at, notes
  ) VALUES (
    uid, 'creator_pro',
    true, true, true,
    true, 10000, 0,
    'admin', 'active', now() + interval '100 years', now(),
    'Full access grant'
  )
  ON CONFLICT (user_id) DO UPDATE
    SET tier = EXCLUDED.tier,
        can_publish_external = true,
        can_schedule_releases = true,
        can_use_collections_unlimited = true,
        priority_generation = true,
        monthly_generation_bonus = 10000,
        rev_share_surcharge_bps = 0,
        source = 'admin',
        payment_status = 'active',
        current_period_end = EXCLUDED.current_period_end,
        notes = 'Full access grant',
        updated_at = now();

  -- Ensure admin role for future self-service
  INSERT INTO public.user_roles (user_id, role)
  VALUES (uid, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
END $$;