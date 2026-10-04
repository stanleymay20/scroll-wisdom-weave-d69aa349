# Tomorrow — Lovable-controlled ScrollLibrary deployment checklist

ScrollLibrary production Supabase is controlled through Lovable. Repository changes do not prove production state, and a row in `supabase_migrations.schema_migrations` does **not** prove the intended SQL objects exist.

Use this checklist only after the Lovable credit reset and after all intended repair work has passed exact-head CI and merged into canonical `main`.

## Before Lovable deployment

- exact intended `main` SHA recorded;
- exact-head CI green on that SHA;
- no unresolved review comments or parallel/regressive implementations;
- Lovable project source SHA equals that same `main` SHA;
- pricing catalogue values match customer-facing copy;
- quality-state terminology is consistent (Draft / Verified / ScrollLibrary Press Certified);
- specialized authoring remains fail-closed unless independently qualified;
- marketplace remains fail-closed until payout settlement lifecycle is proven.

## Known production drift discovered 2026-10-04

Treat these as blockers until the live semantic verifier passes:

- `20261001150000_creator_payout_settlement` was recorded with no executed statements;
- subsequent Lovable `publish_migration_from_pg_dump` entries explicitly dropped `creator_payout_transfers`, `creator_payout_allocations`, and all settlement RPCs;
- `study-music` retained an INSERT policy granted to `PUBLIC` instead of `service_role`;
- live `books.category` is `text`, while fresh databases use `public.book_category`;
- the live `book_requires_publication_evidence(uuid)` function is older than the Health/Psychology/Business + dynamic material-claim contract;
- the FAQ zero-statement migration is already semantically converged and must not be replayed merely because its ledger statement count is zero.

The canonical repair is forward-convergent. Do not delete/rewrite production migration history and do not blindly replay old migrations.

## Lovable / Supabase convergence

Through Lovable only:

1. confirm the Lovable source is the exact approved `main` SHA;
2. apply/deploy all new forward migrations from that `main`, including:
   - `20261004203000_creator_payout_settlement_convergence.sql`;
   - `20261004204000_publication_evidence_live_convergence.sql`;
   - `20261004205000_study_music_storage_policy_convergence.sql`;
3. ensure the legacy-safe `20261004190000_health_psychology_publication_evidence.sql` no longer assumes the enum exists;
4. deploy required Edge Functions from the same source head;
5. install billing catalogue environment values;
6. set GA flags only for domains whose exact-head lifecycle has passed;
7. align publishing-service billing/mint flags with operational readiness;
8. keep marketplace payment/payout flags false until settlement validation passes.

Do not bypass Lovable by making direct production Supabase mutations.

## Mandatory semantic read-back

After Lovable applies the database changes, run the read-only contract in:

`scripts/verify-commercial-live-schema.sql`

The deployment is blocked unless it reports `COMMERCIAL LIVE SCHEMA ASSERTIONS PASSED`.

The verifier proves actual live semantics rather than migration names. It checks:

- payout transfer/allocation tables physically exist;
- all payout reservation/balance/candidate/success/failure RPCs physically exist;
- authenticated users cannot read the payout tables or execute settlement RPCs;
- `study-music` write access is service-role only and has no overlapping browser/public write policy;
- both legitimate `books.category` lineages (`text` or `book_category`) are recognized;
- publication evidence governance includes Health, Psychology, Business, and dynamic material-claim cues.

Immediately rerun the semantic verifier after any Lovable schema publish or generated `pg_dump` migration. A later schema-diff migration that removes these objects is a release blocker even if CI remains green.

## Production smoke

Verify against live production after deployment:

1. release identity/fingerprint corresponds to the intended `main` build;
2. sign-up/sign-in/session path;
3. Free generation and persistence;
4. plan checkout in the approved non-destructive/live-validation path;
5. webhook subscription entitlement read-back;
6. usage meters for text, visuals and narration;
7. export entitlements by tier;
8. cancellation/refund lifecycle;
9. publishing-service order creation and validation-gated ISBN behavior;
10. publication-quality pipeline against a controlled fixture;
11. Teams seat/organization behavior before Teams sale;
12. payout reservation -> Stripe transfer -> acknowledgement -> retry/failure behavior using controlled settlement evidence;
13. marketplace remains closed until Connect transfer/retry/refund settlement has separately passed.

## Content-quality smoke

A controlled publication candidate must demonstrate that:

- draft generation alone does not display a Certified claim;
- Verified requires current-scope technical/evidence/QA/production attestations;
- ScrollLibrary Press Certified is not awarded unless the strict certification thresholds are met;
- any manuscript edit invalidates stale certification evidence;
- factual governed content cannot publish with missing required evidence;
- Health/Psychology consequential claims receive the same fail-closed evidence governance in live production;
- technical content cannot publish with stale/missing code-audit evidence.

## Customer copy smoke

Confirm live Pricing explains:

- project slots versus shared AI-word allowance;
- generated visuals in understandable units;
- narration minutes rather than opaque audio credits;
- marketplace fee as conditional until marketplace GA;
- publishing service as validation-gated ISBN eligibility, not an ISBN sale;
- Assisted Publishing Launch exact service scope before accepting payment.
