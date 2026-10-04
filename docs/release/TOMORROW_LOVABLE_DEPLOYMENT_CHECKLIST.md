# Tomorrow — Lovable-controlled ScrollLibrary deployment checklist

ScrollLibrary production Supabase is controlled through Lovable. Repository changes do not prove production state.

Use this checklist only after the Lovable credit reset and after the quality/pricing branch has been reviewed and merged intentionally.

## Before Lovable deployment

- exact intended `main` SHA recorded;
- exact-head CI green;
- no unresolved review comments or parallel/regressive implementations;
- pricing catalogue values match customer-facing copy;
- quality-state terminology is consistent (Draft / Verified / ScrollLibrary Press Certified);
- specialized authoring remains fail-closed unless independently qualified;
- marketplace remains fail-closed until payout settlement lifecycle is proven.

## Lovable / Supabase convergence

Through Lovable, verify the controlled production backend has:

- all required migrations through the intended release head;
- all required Edge Functions deployed from the intended release head;
- billing catalogue environment values installed;
- GA flags set only for domains whose exact-head lifecycle has passed;
- publishing-service billing/mint flags aligned with operational readiness;
- marketplace payment/payout flags still false until settlement validation passes.

Do not bypass Lovable by making direct production Supabase mutations.

## Production smoke

Verify against live production after deployment:

1. release identity/fingerprint corresponds to the intended build;
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
12. marketplace remains closed unless Connect transfer/retry/refund settlement has separately passed.

## Content-quality smoke

A controlled publication candidate must demonstrate that:

- draft generation alone does not display a Certified claim;
- Verified requires current-scope technical/evidence/QA/production attestations;
- ScrollLibrary Press Certified is not awarded unless the strict certification thresholds are met;
- any manuscript edit invalidates stale certification evidence;
- factual governed content cannot publish with missing required evidence;
- technical content cannot publish with stale/missing code-audit evidence.

## Customer copy smoke

Confirm live Pricing explains:

- project slots versus shared AI-word allowance;
- generated visuals in understandable units;
- narration minutes rather than opaque audio credits;
- marketplace fee as conditional until marketplace GA;
- publishing service as validation-gated ISBN eligibility, not an ISBN sale;
- Assisted Publishing Launch exact service scope before accepting payment.
