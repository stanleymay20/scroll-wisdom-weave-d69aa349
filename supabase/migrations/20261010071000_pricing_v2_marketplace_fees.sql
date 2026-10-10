-- Pricing v2 marketplace fee convergence.
--
-- Forward-only update for future ScrollLibrary-facilitated marketplace sales.
-- Historical creator earnings ledger rows keep the fee_bps_applied snapshot that
-- was recorded when each sale was settled. External-channel royalties (KDP,
-- Ingram, bookstores, direct off-platform sales) do not pass through this
-- function and therefore do not incur a ScrollLibrary marketplace fee.
--
-- Public ladder:
--   Free    10%
--   Creator  7%
--   Pro      5%
--   Teams    3%

CREATE OR REPLACE FUNCTION public.get_user_marketplace_fee_bps(_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier text := 'free';
BEGIN
  SELECT s.tier INTO v_tier
  FROM public.subscriptions s
  WHERE s.user_id = _user_id
    AND s.status IN ('active','trialing')
    AND (s.current_period_end IS NULL OR s.current_period_end > now())
  LIMIT 1;

  IF v_tier IS NULL OR v_tier = '' THEN
    SELECT p.plan INTO v_tier
    FROM public.profiles p
    WHERE p.user_id = _user_id OR p.id = _user_id
    ORDER BY (p.user_id = _user_id) DESC
    LIMIT 1;
  END IF;

  RETURN CASE COALESCE(v_tier, 'free')
    WHEN 'student' THEN 700
    WHEN 'premium' THEN 500
    WHEN 'prophet_tier' THEN 300
    ELSE 1000
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_marketplace_fee_bps(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_marketplace_fee_bps(uuid) TO service_role;
