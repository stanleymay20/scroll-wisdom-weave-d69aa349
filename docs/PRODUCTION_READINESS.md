# Production readiness and GA evidence

ScrollLibrary is eligible for a GA decision only when every required control below has current evidence for the exact release commit. A green build alone is not a production release.

## Required release evidence

| Control | Automated evidence | Release-owner evidence |
| --- | --- | --- |
| Compile and unit correctness | CI `typecheck`, `lint`, `test`, `edge-functions` | None |
| Database change safety | CI `migration-safety` | Staging migration run and Supabase security/performance advisor results |
| Browser journeys | CI `e2e` against deterministic local services | Staging smoke run for auth, checkout, generation, export, account deletion, and administrative authorization |
| Supply-chain security | CI audits the locked production dependency graph, scans committed secrets, and runs `CodeQL` | Enable GitHub Dependency Graph/Dependabot and review any platform security alerts; development-tool advisories remain visible for scheduled upgrade work |
| Performance regression | `build` enforces bundle budgets | Staging Web Vitals and load-test report |
| Artifact provenance | `dist/release.json` and commit-addressed CI artifact. Every build, including a hosted rebuild, serves `/release.json` with `commit`, `commitSource`, and a deterministic `sourceFingerprint`; only the CI artifact also lists per-file digests | Deployment record containing commit SHA when available, source fingerprint, artifact digest, environment, actor, and timestamp |
| Recovery | Not safely automatable from source control | Successful backup restore rehearsal and rollback exercise |

## Promotion policy

1. Create changes on a branch and require all pull-request checks to pass.
2. Deploy the CI-produced artifact to staging; do not rebuild it during promotion.
3. Apply migrations to staging and run database advisors. Resolve all security findings and material performance findings.
4. Execute the staging critical-journey checklist and record evidence against the commit in the release issue.
5. Obtain release-owner approval, then promote the same artifact digest to production.
6. Verify `/release.json` against the exact-head CI release manifest and run production read-only smoke tests. Prefer an exact `commit` match. When hosted infrastructure strips Git metadata and `commitSource` is `unavailable`, the deployment is acceptable only when `sourceFingerprint` exactly matches the CI manifest for the intended commit; otherwise treat the deployed source as unknown.
7. Roll back immediately if authentication, authorization, checkout, publication, export, or deletion verification fails.

Dependency exceptions live in `security/audit-exceptions.json`, are advisory-specific, and expire automatically. A new advisory always fails CI; renewal requires an explicit code review and updated risk rationale.

The lint warning ceiling is pinned to the current legacy baseline. Any added warning fails CI; the ceiling must only move downward as warnings are repaired.

## Hosted-build provenance

Lovable-hosted Vite builds do not reliably expose a Git commit SHA or a readable `.git` directory. ScrollLibrary therefore emits a deterministic SHA-256 `sourceFingerprint` over the production-affecting repository inputs in both CI and every hosted build.

A source fingerprint is evidence of source equivalence, not a replacement for a Git commit. GA evidence for a hosted rebuild must record the intended Git commit and prove that production's `sourceFingerprint` equals the fingerprint in that commit's CI release artifact. A missing or mismatched fingerprint is a release blocker.

The `GA Production Verification` workflow performs this comparison against `https://scrolllibrary.org/release.json` and also requires a successful exact-head Stripe test-mode lifecycle before the release can be certified.

## Critical staging journeys

- New account, sign-in, token refresh, sign-out, and password recovery.
- Unauthorized users are denied protected and administrative resources.
- Subscription checkout and webhook idempotency with Stripe test mode.
- Book generation, publication certification, export, and artifact download.
- Marketplace purchase, entitlements, creator earnings, and refund/reversal behavior.
- User-data export and account deletion.
- PWA update from the prior production build without a stale-chunk loop.

## Rollback and recovery

- Frontend: retain the prior commit-addressed artifact and redeploy it without rebuilding.
- Edge Functions: retain the prior function bundle/version and redeploy the known-good version.
- Database: migrations are forward-only. Use a reviewed compensating migration; never rewrite or delete applied migration history.
- Data recovery: restore the latest backup into an isolated project, validate row counts and critical relations, then follow the incident lead's approved recovery plan.
- Incident evidence: preserve release manifest, deployment logs, Supabase logs, webhook event IDs, and the incident timeline.

## Current decision

Repository controls can prove that a candidate is releasable. GA additionally requires current staging, deployment, backup/restore, and production verification evidence. The release owner must not mark GA complete while any of those external proofs are missing.
