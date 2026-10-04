# Read-only Production Audit — main 702e385e

Scope: read-only only. No code, schema, secret, deployment, data or Stripe changes, and no publish.

## Already verified
- Repo head is 702e385e. It has 233 migration files; the newest is `20261001150000_creator_payout_settlement.sql`.
- The payout migration, the payout transfer and allocation tables, and the payout RPCs are missing on both Live and Test.
- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` exist. No GA flag is set, so everything is fail-closed.
- Live has 0 rows in `stripe_webhook_events`.

## Audit steps

1. **Exact-head CI.** Read the GitHub Actions results for push runs on 702e385e through the GitHub connector, if one is available. If not, mark this as needing your input.

2. **Object-level drift manifest, Test vs repo intent.** Catalog queries on Test covering:
   - tables, and columns with their types, defaults and nullability
   - enums, indexes, constraints and foreign keys
   - RLS enablement and policies, and grants
   - functions: signatures, SECURITY DEFINER, search_path, EXECUTE privileges
   - triggers, storage buckets and policies, cron jobs

   I compare these against the objects defined in the migrations from roughly the last converged point onward. That includes the payout migration and the billing order fulfillment and refund migrations. Each manifest row gives: object, expected state, actual state, owning migration, dependency order, risk.

3. **Same manifest against Live**, so the publish impact is known, including the books.category/profiles.plan type drift and the missing cron jobs.

4. **Data-compatibility probes (read-only).** Distinct values and row counts for any column whose type or constraint would change, such as the enum casts.

5. **Security posture.** Database linter and current security scan results.

6. **Edge function reachability.** Unauthenticated OPTIONS/POST calls to settle-creator-payouts, creator-earnings-summary and admin-refund-purchase on Test, to confirm they fail closed (401/403/503) and leak nothing. I won't call them with admin credentials.

7. **Stripe (read-only API).** Check:
   - account livemode
   - products and prices against the repo catalogue
   - Checkout Terms and automatic tax settings
   - webhook endpoints: URL, status and enabled events against the 16-event contract
   - recent event delivery
   - Connect capabilities and status

## Deliverable
One audit report covering:
- the drift manifest
- blockers ranked by severity
- the CI status for 702e385e
- Stripe readiness
- the remaining unverifiable items

No remediation will run.
