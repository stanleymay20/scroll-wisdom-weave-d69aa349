# Production Readiness Audit — head 702e385e (read-only, nothing changed)

## Evidence (verified this turn)

Repo at 702e385e27f021ccc6d3d432ed4f09853fbbbd33: 233 migration files. The newest is `20261001150000_creator_payout_settlement.sql`, which is the only file that defines `reserve_creator_payout`. The functions `settle-creator-payouts`, `creator-earnings-summary` and `admin-refund-purchase` exist in the source.

| Check | Live (scrolllibrary.org) | Test (preview) |
|---|---|---|
| Newest recorded migration | 20260930024551 (36 rows) | 20260726224925 |
| Payout settlement migration (>= 20261001150000) | Not recorded | Not recorded |
| `creator_payout_transfers` / `_allocations` tables | Missing | Missing |
| `creator_payout_profiles` table | Present | Present |
| Payout RPCs (reserve, list_candidates, mark_transferred, mark_failed, get_balance) | All missing | All missing |
| `stripe_webhook_events` rows | 0 | not checked |

Configured secret names (values were not read): `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are present. **None of the GA flags are configured:** GA_PAYMENTS_ENABLED, GA_MARKETPLACE_PAYMENTS_ENABLED, GA_MARKETPLACE_PAYOUTS_ENABLED, GA_PUBLISHING_SERVICES_BILLING_ENABLED, GA_PUBLICATION_MINT_ENABLED and the others. The flag code treats a missing flag as disabled. So payouts and payment writes return 503 by design.

## Answers
1. **Migrations:** Not converged. The payout migration is not applied on Live or on Test. The migration history tables don't map one-to-one to repo files (Live has 36 rows and the repo has 233 files), so a per-file diff can't be confirmed from history alone.
2. **Payout database authority:** Missing on Live and on Test.
3. **Edge function versions:** I can't check deployed versions with the tools available. If `settle-creator-payouts` is deployed, it would fail at the RPC call. Right now it stops earlier at the flag gate with 503.
4. **Flags:** Not set, so everything is disabled.
5. **Stripe:** The keys are present. The mode (test vs live), the webhook endpoint registration and the Connect platform status were not checked. No webhook event has ever been recorded on Live, so there's no evidence the endpoint is wired.
6. Remediation is below.

## Blockers
- Test doesn't have the payout migration either. Publish copies Test to Live, so Live can't receive the migration until Test has it.
- Known publish drift is still open (enum vs text in books.category/profiles.plan, missing cron jobs).
- GA flags are absent.
- Stripe webhook and Connect are unverified.

## Safest ordered remediation (needs your approval for each step)
1. **Read-only:** compare the Test schema with the 233 repo files at the object level to find every migration missing from Test, not just the payout one.
2. Apply `20261001150000_creator_payout_settlement` to **Test** through the migration tool. Then run `scripts/test-creator-payout-settlement.sql` and `scripts/test-payout-surface.sql` on Test. Both roll back their own changes.
3. Deploy the three edge functions to Test. Smoke-test that they correctly return 503 while flags are off.
4. **Read-only:** use the Stripe tools to confirm account mode, the webhook endpoint URL and its events (against `scripts/check-stripe-webhook-event-contract.mjs`), and Connect enablement.
5. **You:** tap Publish. That moves the migrations and functions to Live. Then re-run the Live checks above to confirm the tables and RPCs exist.
6. **You:** add the GA flags in Project Settings → Secrets, in runbook order. Keep GA_MARKETPLACE_PAYOUTS_ENABLED off until one test-mode Connect transfer settles end to end.

## Not verifiable here
- Deployed edge function versions and commit hashes.
- The values of secrets.
- Stripe dashboard state (until step 4).
- Whether GitHub main equals 702e385e. The local HEAD matches it.
