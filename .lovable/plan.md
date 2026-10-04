# Production Readiness Audit — main 702e385e (read-only, nothing changed)

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
1. **Migrations:** Not converged. The payout migration is not applied on Live or on Test. The history row counts (Live 36, repo 233) do **not** mean 197 migrations are missing. History may have been squashed, consolidated or applied outside a one-file-per-row mapping. Real convergence has to be judged object by object (step 2).
2. **Payout database authority:** Missing on Live and on Test.
3. **Edge function versions:** I can't check deployed versions or commit hashes with the tools available. Proof has to come from runtime behavior (step 7).
4. **Flags:** Not set, so everything is disabled.
5. **Stripe:** The keys are present. Everything else is unverified (step 8). No webhook event has ever been recorded on Live.
6. Remediation is below.

## Release precondition (hard gate)
Do not publish, and do not change Test or Live, until every push-triggered GitHub Actions workflow for the exact main commit `702e385e27f021ccc6d3d432ed4f09853fbbbd33` has finished green. A green PR-head CI run does not count; the merged main commit itself must pass.

## First-class blockers
- **B1:** Test is missing the payout migration. Publish copies Test to Live, so Live can't receive it until Test has it.
- **B2:** Type drift: `books.category` and `profiles.plan` are enums on Live but text on Test.
- **B3:** Cron jobs are missing on Live. Storage owner-bound policy and bucket strategy are undecided.
- **B4:** GA flags are absent (expected for now; this is not a defect).
- **B5:** Stripe webhook and Connect are unverified.

Do not apply `20261001150000_creator_payout_settlement.sql` alone on top of unresolved incompatible drift.

## Ordered remediation (each write step needs separate approval)

1. **Release gate.** Confirm the exact-head workflow results for 702e385e. Stop if any are red or pending.

2. **Object-level convergence audit of Test vs repo intent (read-only).** Cover all release-critical objects affected since the last known converged state:
   - tables, and columns with their types, defaults and nullability
   - enums, indexes, constraints and foreign keys
   - RLS enablement and policies, and grants
   - functions: signatures, SECURITY DEFINER, search_path, EXECUTE privileges
   - triggers, storage buckets and policies, cron jobs
   - seed/config state defined by migrations

   Output: a drift manifest with one row per object: object, expected state, actual Test state, owning migration(s), dependency order, risk, proposed remediation. Repeat the same audit for Live so the publish impact is known in advance.

3. **Minimal Test convergence plan.** Built from the manifest, ordered by dependency. It resolves B2/B3 first, then the payout migration, and keeps existing valid data. No drop-and-recreate of production-like data just to match migrations.

4. **Pre-write safety checks (before any Test schema change):**
   - Confirm each change is additive or backward-compatible where possible.
   - Flag destructive or locking DDL.
   - Count affected rows for each altered table.
   - Prove existing data satisfies new constraints and types, for example enum casts.
   - Define rollback and recovery steps for each operation.

5. **Apply the Test convergence** through the migration tool, in manifest order, after approval.

6. **Verification on Test, with all GA flags OFF:**
   - `test-creator-payout-settlement.sql` and `test-payout-surface.sql`
   - creator payout lifecycle
   - commerce ledger and refund scripts (`test-commerce-ledger-lifecycle.sql`, billing/refund tests)
   - RLS and security scripts, and `check-migration-safety.mjs`
   - database linter and security scan

7. **Edge functions on Test.** Deploy the exact 702e385e source for settle-creator-payouts, creator-earnings-summary and admin-refund-purchase, plus any directly changed `_shared` dependencies. Then prove behavior with deterministic smoke tests and logs:
   - all three fail closed (503) while flags are absent
   - unauthenticated calls get 401 and non-admins get 403
   - admin-origin guard is enforced
   - no service-role key or secret appears in any response or log

8. **Stripe read-only verification.** No charges or transfers. Check:
   - account livemode vs testmode
   - product and price IDs the repo expects (against `check-billing-package-contract.mjs`)
   - Checkout Terms configuration and automatic tax readiness
   - webhook endpoint URL, status and event subscriptions against the 16-event contract
   - signing secret alignment, judged from recent delivery results
   - recent delivery history
   - Connect platform capabilities and status
   - whether the separate-charges-and-transfers model matches the implemented payout worker

9. **Release evidence pack.** One summary covering:
   - exact main SHA and the exact-head workflow results
   - Test drift: resolved and unresolved
   - migration and object verification
   - function smoke tests and security/RLS status
   - Stripe readiness
   - remaining external or legal blockers

   Publish only if no critical blocker remains.

10. **Publish from Lovable (you).** Immediately afterwards, re-run the read-only Live checks: schema, RPCs, tables, cron and RLS. Confirm the payout migration authority exists, and confirm the Live functions fail closed before any flag is enabled.

11. **GA flags (you, in Project Settings → Secrets).** Enable them in dependency order, one domain at a time, with a verification checkpoint after each. Keep GA_MARKETPLACE_PAYMENTS_ENABLED, VITE_MARKETPLACE_GA_ENABLED and especially GA_MARKETPLACE_PAYOUTS_ENABLED OFF until one controlled, safe Connect lifecycle has succeeded end to end: sale, transfer, refund, retry, reconciliation. Never enable a flag just because its migrations exist.

12. **Final GA acceptance.** Record pass/fail evidence for each real journey:
    - signup and login
    - create, generate and review
    - PDF and EPUB export
    - publication gate and ISBN assignment
    - subscription and one-time checkout, entitlement, refund
    - Teams (if in GA)
    - marketplace purchase, creator earnings, payout settlement
    - failure, retry and idempotency
    - observability and logging

## Not verifiable with current tools
- Deployed edge function versions and commit hashes (covered by runtime proof instead).
- Secret values (by design).
- Stripe account and dashboard state, until step 8 runs.
- GitHub Actions run results for 702e385e, unless they're provided or read through a GitHub connection. Main equality is already confirmed: main and the Lovable head are both 702e385e.
