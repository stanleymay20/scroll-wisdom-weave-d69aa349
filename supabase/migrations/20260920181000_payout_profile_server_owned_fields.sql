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

-- REVOKE ALL rather than naming the write privileges, because naming them
-- misses one. Supabase grants browser roles every privilege on a public table
-- by default and relies on RLS for safety — but TRUNCATE is not subject to
-- row-level security at all. A policy limiting a creator to their own row does
-- nothing against `TRUNCATE creator_payout_profiles`, which would erase every
-- creator's payout configuration at once. An earlier draft of this migration
-- revoked INSERT, UPDATE and DELETE and left that behind; CI caught it.
REVOKE ALL ON TABLE public.creator_payout_profiles FROM anon, authenticated;

-- Reading your own profile stays a direct, policy-governed query. This is the
-- only privilege a browser role needs here, and now the only one it has.
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
