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
- Teams checkout remains unavailable until pooled organization usage and seat inheritance are implemented and proven, or the customer-facing Teams promise is narrowed truthfully;
- marketplace remains fail-closed until payout settlement lifecycle is proven.

## Known production drift discovered 2026-10-04

Treat these as blockers until the live semantic verifier passes:

- `20261001150000_creator_payout_settlement` was recorded with no executed statements;
- subsequent Lovable `publish_migration_from_pg_dump` entries explicitly dropped `creator_payout_transfers`, `creator_payout_allocations`, and all settlement RPCs;
- the Sept. 30 billing-authority migrations are absent live: `billing_usage_monthly`, `billing_orders`, refund authority and their server RPCs do not exist;
- browser roles can execute multiple server/maintenance-only SECURITY DEFINER RPCs because the Sept. 30 privilege convergence is absent live;
- `publishing_certificates` is browser-mutable live: `anon`/`authenticated` still have UPDATE/DELETE table privileges and the historical owner `FOR ALL` policy remains;
- `study-music` retained an INSERT policy granted to `PUBLIC` instead of `service_role`;
- live `books.category` is `text`, while fresh databases use `public.book_category`;
- the live `book_requires_publication_evidence(uuid)` function is older than the Health/Psychology/Business + dynamic material-claim contract;
- the FAQ zero-statement migration is already semantically converged and must not be replayed merely because its ledger statement count is zero.

The canonical repair is forward-convergent. Do not delete/rewrite production migration history and do not blindly replay old migrations.

## Lovable / Supabase convergence

Through Lovable only:

1. confirm the Lovable source is the exact approved `main` SHA;
2. apply/deploy all new forward convergence migrations from that `main`, including payout, evidence, storage, billing-authority, certificate-authority and internal-RPC privilege convergence;
3. ensure the legacy-safe `20261004190000_health_psychology_publication_evidence.sql` no longer assumes the enum exists;
4. deploy required Edge Functions from the same source head;
5. install and validate billing catalogue environment values for only the plans/SKUs being offered;
6. set GA flags only for domains whose exact-head lifecycle has passed;
7. align publishing-service billing/mint flags with operational readiness;
8. keep marketplace payment/payout flags false until settlement validation passes;
9. keep Teams sale closed until pooled projects/words and seat inheritance are end-to-end real, or remove those promises and re-review the package.

Do not bypass Lovable by making direct production Supabase mutations.

## Mandatory semantic read-back

After Lovable applies the database changes, run the read-only contract in:

`scripts/verify-commercial-live-schema.sql`

The deployment is blocked unless it reports `COMMERCIAL LIVE SCHEMA ASSERTIONS PASSED`.

The verifier proves actual live semantics rather than migration names. It checks:

- billing usage/order/refund tables physically exist;
- billing reservation/release/add-on/order/refund RPCs exist with server-only privileges;
- payout transfer/allocation tables physically exist;
- all payout reservation/balance/candidate/success/failure RPCs physically exist;
- authenticated/anonymous users cannot read payout internals or execute settlement RPCs;
- internal SECURITY DEFINER maintenance RPCs are not browser-callable;
- browser roles cannot INSERT/UPDATE/DELETE `publishing_certificates`, no browser/public write policy remains, and `service_role` retains mutation authority;
- `study-music` write access is service-role only and has no overlapping browser/public write policy;
- both legitimate `books.category` lineages (`text` or `book_category`) are recognized;
- publication evidence governance includes Health, Psychology, Business, and dynamic material-claim cues.

Immediately rerun the semantic verifier after any Lovable schema publish or generated `pg_dump` migration. A later schema-diff migration that removes these objects or resets these grants/policies is a release blocker even if CI remains green.

## Production smoke

Verify against live production after deployment:

1. release identity/fingerprint corresponds to the intended `main` build;
2. sign-up/sign-in/session path;
3. Free generation and persistence;
4. Creator and Pro checkout only after billing authority and catalogue read-back pass;
5. webhook subscription entitlement read-back;
6. usage meters for text, visuals and narration;
7. export entitlements by tier;
8. cancellation/refund lifecycle, including proof that cancelled subscriptions do not retain paid entitlement through a stale `profiles.plan` fallback;
9. browser certificate-tamper regression: authenticated/anonymous users cannot update, delete, un-revoke or self-upgrade `publishing_certificates`;
10. publishing-service order creation and validation-gated ISBN behavior;
11. publication-quality pipeline against a controlled fixture;
12. Teams pooled usage, member plan inheritance, seat add/remove and organization behavior before Teams sale;
13. payout reservation -> Stripe transfer -> acknowledgement -> retry/failure behavior using controlled settlement evidence;
14. marketplace remains closed until Connect transfer/retry/refund settlement has separately passed.

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
- Assisted Publishing Launch exact service scope before accepting payment;
- Teams is not purchasable while pooled usage/seats are not production-proven.
