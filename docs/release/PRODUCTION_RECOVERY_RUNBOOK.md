# ScrollLibrary Production Recovery Runbook

Status: operational contract. Rehearsal evidence is required before this runbook can be marked proven.

Production control plane: Lovable. Canonical source of truth: GitHub `main`.

## Non-negotiable rules

1. Never repair production by rewriting or deleting rows from `supabase_migrations.schema_migrations`.
2. Never treat a recorded migration version as proof that its intended objects, grants, policies or function bodies exist.
3. Never bypass Lovable with ad-hoc production Supabase mutations during normal recovery.
4. Prefer a forward convergence migration to destructive history repair.
5. No release is considered recovered until source identity, live schema semantics, auth/RLS and the affected commercial lifecycle are reverified.
6. External money movement must be contained first when the integrity of billing, marketplace or payout state is uncertain; feature flags are domain gates, not a universal Stripe freeze.
7. Immutable financial/ISBN/evidence ledgers must not be rewritten to make a recovery look clean.

## Release identity

For every production release record:

- exact canonical `main` SHA;
- merge/PR that introduced the release;
- Lovable project source SHA;
- production release identity/fingerprint;
- database semantic-verifier result;
- required E2E/Stripe/security evidence;
- operator and timestamp.

GitHub `main` and Lovable project source must resolve to the same intended SHA. For the deployed hosted build, require the exact commit SHA when release metadata exposes it. When Lovable strips Git metadata and the release reports commit identity as unavailable, use the repository's established release-identity verifier: the hosted source fingerprint and file count must match the fingerprint computed for the intended canonical SHA. If neither exact-commit nor accepted fingerprint proof matches, stop the release and classify it as source drift.

## Emergency commercial containment

When a payment or marketplace incident is suspected, close the smallest affected domain before debugging.

Keep or set false as appropriate through the Lovable-controlled environment:

- `GA_PAYMENTS_ENABLED`
- subscription checkout / commercial subscription release flag
- `GA_TEAMS_SUBSCRIPTION_ENABLED`
- `GA_PUBLISHING_SERVICES_BILLING_ENABLED`
- `GA_MARKETPLACE_PAYMENTS_ENABLED`
- `GA_MARKETPLACE_PAYOUTS_ENABLED`

The exact flag names and catalogue environment values must be read from the release candidate at the incident SHA before changing configuration. Do not assume an old runbook copy is authoritative.

These gates stop the application paths that explicitly enforce them; they are **not** a global Stripe write lock. In particular, separately inspect and contain ungated Stripe-writing operations such as administrative refund tooling and customer-portal session creation when the incident requires a broader freeze. If total external-write containment is required, enumerate every reachable Stripe-writing endpoint for the incident SHA, disable or operationally restrict the affected routes/actions through the supported control plane, and verify the result before claiming that Stripe writes are frozen.

Containment does not reconcile already-created Stripe payments, transfers, refunds, portal actions or entitlements.

## Database incident procedure

### 1. Contain the affected surface

- disable the relevant gated external-write surface;
- if the incident requires broader Stripe containment, separately account for ungated refund/portal/administrative write paths as described above;
- preserve logs, correlation IDs, Stripe IDs, billing order IDs and affected user/book IDs;
- do not delete failed/ambiguous records;
- record the current production migration ledger and semantic state read-only.

### 2. Diagnose semantic state

Run read-only production checks through Lovable. At minimum:

- `scripts/verify-commercial-live-schema.sql`;
- intended object existence using `to_regclass` / `to_regprocedure`;
- `pg_policies` for affected RLS/storage policy paths;
- `has_table_privilege` / `has_function_privilege` for authority boundaries;
- current function body where semantic drift is suspected;
- migration ledger version/name/statement count.

If the ledger says a migration is applied but the semantic object is absent or wrong, treat the schema as drifted. Do not mark the old migration as unapplied; create a forward convergence migration on a branch from current `main`.

### 3. Forward convergence

- reverse-engineer the actual production shape first;
- make the migration tolerant only of legitimate known lineages;
- fail loudly on unknown schema shapes;
- restore grants/policies explicitly rather than assuming defaults;
- include postconditions in the migration for critical authority boundaries;
- add/extend repository contract tests and the live semantic verifier;
- run exact-head CI and real disposable-Supabase E2E;
- merge the immutable green head into `main`;
- allow Lovable to sync to that exact SHA;
- deploy/apply through Lovable only;
- rerun the live semantic verifier after Lovable finishes, including after any generated schema-diff/`pg_dump` migration.

## Backup and restore

Backup/PITR availability depends on the active Lovable/Supabase production plan and must be confirmed in the control plane before declaring this runbook proven.

When a restore is required:

1. identify the target recovery point and incident boundary;
2. preserve current production evidence before restoration;
3. restore into an isolated/non-production validation environment first whenever the platform supports that workflow;
4. verify schema, RLS, authority boundaries, financial ledgers, ISBN ledgers, certificates and key user/book records;
5. run the commercial live semantic verifier against the restored candidate where technically possible;
6. reconcile external Stripe state separately — database restore does not roll Stripe back;
7. obtain explicit release approval before production restoration;
8. after production restore, redeploy the exact intended `main` SHA through Lovable and rerun all applicable semantic and smoke checks.

Never use a database restore as a substitute for Stripe/payment reconciliation.

## Application / Edge Function rollback

The safe rollback is source-controlled and forward-auditable.

1. identify the last known-good production SHA and the offending merge/commit;
2. create a rollback branch from current `main`;
3. use Git revert semantics for the offending change rather than moving `main` backward or force-pushing history;
4. if database migrations are involved, do not attempt to unapply them by deleting migration history — add a forward corrective migration where required;
5. run exact-head CI/security/real E2E;
6. merge the green rollback/correction into `main`;
7. deploy through Lovable from the new canonical `main` SHA;
8. verify hosted release identity (exact commit when available, otherwise the accepted fingerprint/file-count proof) and `scripts/verify-commercial-live-schema.sql`;
9. exercise the incident-specific production smoke path.

## Frontend rollback

For a frontend-only regression:

- close any affected paid/unsafe feature with its server-owned gate first if necessary;
- revert the offending source change on a branch from current `main`;
- run exact-head CI/build/E2E;
- merge to `main`;
- redeploy through Lovable;
- verify hosted release identity and the affected browser path.

A client-only rollback must never be used as the sole protection for billing, entitlement, RLS or financial authority defects.

## Stripe/payment recovery

If payment outcome is ambiguous:

- contain new writes in the affected commercial domain if duplication is possible, while remembering that GA flags do not automatically disable every Stripe-writing route;
- preserve Stripe event/payment/subscription/transfer IDs and ScrollLibrary order/reservation IDs;
- use idempotent server reconciliation paths, not manual row edits;
- replay only through the canonical webhook/reconciliation mechanism;
- distinguish definitive external rejection from timeout/unknown outcome;
- do not release ledger reservations where the external processor may already have moved money;
- reconcile refunds/disputes/transfers against the authoritative internal order/settlement record;
- restore affected routes/flags only after duplicate/replay and entitlement read-back tests pass.

Creator payouts remain independently fail-closed until their Stripe Connect reconciliation contract is proven.

## Publishing / ISBN recovery

- never recycle an ISBN merely because a billing order was refunded or a publication was withdrawn;
- preserve immutable assignment/edition identity;
- if publication metadata must be corrected, follow the publication/ISBN ledger's supported successor/correction workflow;
- do not mark publishing-service fulfillment complete solely from Stripe payment state;
- keep publishing-service billing disabled if human/production fulfillment cannot proceed safely after recovery.

## Certificate / quality-evidence recovery

- publishing certificates and quality attestations are evidence records, not user-authored mutable state;
- browser roles must not gain mutation authority during a schema restore/publish;
- after any database/schema recovery, rerun certificate privilege checks and verification fixtures;
- manuscript edits must invalidate stale hash-bound certification evidence as defined by the current certification contract.

## Mandatory post-recovery verification

At minimum, prove:

1. GitHub `main` SHA = Lovable project source SHA, and the deployed hosted release proves that intended source either by exact commit identity or by the accepted fingerprint + file-count comparison when commit metadata is unavailable;
2. `scripts/verify-commercial-live-schema.sql` passes live;
3. signup/signin/session refresh and RLS smoke pass;
4. the affected billing/entitlement lifecycle passes in Stripe test mode when payments are involved;
5. Free generation/persistence remains intact;
6. Creator/Pro quota reservation is fail-closed and reconciles correctly if those plans are enabled;
7. certificate tamper attempts are denied;
8. storage owner boundaries and study-music write boundary pass;
9. no browser-executable internal SECURITY DEFINER privilege drift is present;
10. affected export/publishing/marketplace/payout flow passes its domain-specific acceptance test;
11. monitoring/correlation IDs are visible for the recovered path.

## Incident evidence pack

Create an incident record containing:

- severity and user impact;
- start/end time;
- discovery source;
- exact pre-incident and recovered SHAs;
- production semantic snapshots before and after repair;
- relevant Stripe/Lovable/Sentry/correlation identifiers;
- root cause;
- commands/queries/checks used;
- corrective PR and migrations;
- CI/E2E/live verification evidence;
- data/financial reconciliation outcome;
- follow-up prevention work.

Do not include secrets, credentials or raw sensitive user data in repository evidence.

## Rehearsal requirement

This runbook is documentation until rehearsed. Before full commercial GA, record evidence for:

- one isolated database restore or equivalent recovery rehearsal supported by the control plane;
- one source/Edge/frontend rollback rehearsal using Git revert -> exact-head CI -> Lovable redeploy;
- one commercial containment + recovery exercise that explicitly distinguishes gated surfaces from any remaining ungated Stripe-write paths;
- successful post-recovery semantic verifier and auth/RLS smoke.

After those rehearsals, update the release evidence pack and issue #139 with dates, SHAs and non-secret evidence references.
