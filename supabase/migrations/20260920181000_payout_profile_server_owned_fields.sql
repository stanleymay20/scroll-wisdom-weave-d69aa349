-- Stop a creator from choosing where their money goes.
--
-- creator_payout_profiles carries a policy called
--   "Owners update own payout profile (non-stripe fields)"
-- whose body is:
--   USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())
--
-- Row-level security restricts WHICH ROWS a statement may touch. It cannot
-- restrict which columns. The parenthetical is a promise the policy has no
-- mechanism to keep, and `authenticated` holds UPDATE on every column of the
-- table, so any signed-in user could send PostgREST:
--
--   PATCH /rest/v1/creator_payout_profiles?user_id=eq.<their own id>
--   { "stripe_connect_account_id": "acct_<someone else's>",
--     "stripe_connect_status": "verified",
--     "payout_method": "stripe_connect" }
--
-- and mark themselves a verified payee pointed at an arbitrary Stripe account.
-- Today that is inert because nothing pays out yet. It stops being inert the
-- moment payouts ship, which is why it is fixed first: the money path should
-- not be built on top of it.
--
-- Nothing in the application writes this table from the browser.
-- PayoutProfileEditor calls the creator-payout-profile edge function, which
-- uses the service-role client, so the writes that matter go through a server
-- that decides what a creator is allowed to change. Revoking direct write
-- access removes the second, unguarded door to the same table.
--
-- The earnings ledger was already correct — `authenticated` holds SELECT only
-- — and is untouched here.

-- Writes go through the edge function. Browsers read; they do not write.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.creator_payout_profiles FROM anon, authenticated;

-- anon should never have reached this table at all. No policy grants it rows,
-- so the grant was inert, but an inert grant on a payout table is one
-- forgotten policy away from being live.
REVOKE ALL ON TABLE public.creator_payout_profiles FROM anon;

-- Reading your own profile stays a direct, policy-governed query.
GRANT SELECT ON TABLE public.creator_payout_profiles TO authenticated;

-- service_role is the server identity the edge functions hold.
GRANT ALL ON TABLE public.creator_payout_profiles TO service_role;

-- Drop the policies that now describe privileges nobody holds. Leaving an
-- UPDATE policy whose name claims a column restriction it never enforced is
-- how this was misread in the first place.
DROP POLICY IF EXISTS "Owners update own payout profile (non-stripe fields)" ON public.creator_payout_profiles;
DROP POLICY IF EXISTS "Owners insert own payout profile" ON public.creator_payout_profiles;

COMMENT ON TABLE public.creator_payout_profiles IS
  'Creator payout destinations. Readable by the owner and admins; written only by the service role via the creator-payout-profile and stripe-connect-onboarding edge functions. stripe_connect_account_id and stripe_connect_status are set from Stripe webhooks and must never be settable by a client.';
