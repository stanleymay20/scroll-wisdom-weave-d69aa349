# ScrollLibrary Commercial GA Evidence Pack — Template

Use one copy of this document per release candidate. Replace every `PENDING` value with evidence or leave the release blocked. Do not convert an unknown into PASS.

## 1. Candidate identity

- Candidate date/time (UTC): `PENDING`
- GitHub canonical `main` SHA: `PENDING`
- Merge/PR set included: `PENDING`
- Lovable project source SHA: `PENDING`
- Public production release identity/fingerprint: `PENDING`
- Operator/reviewer: `PENDING`
- Overall decision: `NO-GO` until every enabled-domain blocker below is closed

Required invariant: GitHub `main` = Lovable source = intended deployed release identity.

## 2. Repository verification

Record exact-head conclusions for the candidate SHA:

| Gate | Result | Evidence |
|---|---|---|
| CI | PENDING | |
| GA Real E2E | PENDING | |
| CodeQL | PENDING | |
| Dependency Review | PENDING | |
| Storage Boundary Security | PENDING | |
| Admin Financial Boundary | PENDING | |
| Interactive Voice Security | PENDING | |
| Strict Null Ratchet | PENDING | |
| EPUB Conformance | PENDING | |
| Content Quality Doctrine | PENDING | |
| Stripe Test-Mode Lifecycle | PENDING | Must say whether the actual lifecycle job executed or was skipped |

A green workflow wrapper with its substantive job skipped is **not** lifecycle evidence.

## 3. Lovable-controlled database convergence

- Lovable deployment/apply timestamp: `PENDING`
- Latest relevant migration versions: `PENDING`
- Any Lovable-generated schema-diff/pg_dump migration after canonical migrations: `PENDING`
- `scripts/verify-commercial-live-schema.sql`: `PENDING`
- Expected notice: `COMMERCIAL LIVE SCHEMA ASSERTIONS PASSED`

Attach/read back evidence for:

- billing usage/order/refund tables;
- billing reservation/release/add-on/order/refund RPCs;
- payout transfer/allocation tables and settlement RPCs if payout domain is being enabled;
- internal SECURITY DEFINER privilege boundaries;
- publishing-certificate browser immutability;
- study-music write authority;
- book category lineage and publication-evidence function semantics.

Migration-ledger presence alone is insufficient.

## 4. Production auth and RLS

- Signup: `PENDING`
- Email/password login: `PENDING`
- Session refresh: `PENDING`
- Password reset: `PENDING`
- OAuth enabled paths, if marketed: `PENDING`
- Cross-user book/chapter/storage RLS denial: `PENDING`
- Account data export: `PENDING`
- Account deletion + retained-certificate behavior: `PENDING`

## 5. Subscription and Stripe catalogue evidence

For each plan intended to be purchasable, record live/test catalogue read-back:

| Plan | Interval | Expected amount/currency | Stripe price ID | Active/product mapping proven | Checkout lifecycle |
|---|---|---:|---|---|---|
| Creator | monthly | $19 USD | PENDING | PENDING | PENDING |
| Creator | annual | $190 USD | PENDING | PENDING | PENDING |
| Pro | monthly | $69 USD | PENDING | PENDING | PENDING |
| Pro | annual | $690 USD | PENDING | PENDING | PENDING |
| Teams | monthly | $199 USD | PENDING | PENDING | MUST REMAIN CLOSED until Teams GA |
| Teams | annual | $1,990 USD | PENDING | PENDING | MUST REMAIN CLOSED until Teams GA |

Prove, for each enabled plan:

- server resolves/validates Stripe price;
- Checkout succeeds in test mode;
- signed webhook is accepted;
- duplicate webhook is idempotent;
- entitlement read-back is correct;
- usage reservation/meter uses the paid plan;
- update/cancel/renewal failure reconciles correctly;
- customer portal path works as intended.

## 6. One-time usage orders

For every enabled add-on:

- exact amount/currency: `PENDING`
- validity rule disclosed consistently: `PENDING`
- order created idempotently: `PENDING`
- signed payment webhook: `PENDING`
- benefit granted exactly once: `PENDING`
- full refund reverses benefit safely: `PENDING`
- month-end/billing-period edge case tested: `PENDING`

## 7. Generation value by tier

### Free

- server route/model floor: `PENDING`
- 25k-word / project/chapter limits enforced: `PENDING`
- generation persistence: `PENDING`

### Creator

- server route/model floor: `PENDING`
- 250k-word allowance enforced: `PENDING`
- Creator editorial route proven: `PENDING`
- no silent Free-model downgrade: `PENDING`

### Pro

- server route/model floor: `PENDING`
- 1M-word allowance enforced: `PENDING`
- Pro Chief Editor route proven: `PENDING`
- no silent lower-tier rewrite: `PENDING`

### Teams

Keep closed until organization pool + five-seat inheritance acceptance issue passes.

## 8. Content-quality evidence

Release-safe claim for unqualified generation: AI-assisted Draft/Verified according to actual evidence.

### Standard Text qualification

- Complete fresh books: `PENDING / 5`
- Human-reviewed passing books: `PENDING / 3`
- Chief Editor >=95 each: `PENDING`
- Publishability >=98 each: `PENDING`
- Zero blockers/warnings: `PENDING`
- Human mean >=9.5/10: `PENDING`
- Every rubric dimension >=9.0: `PENDING`
- Zero critical issues: `PENDING`
- Evidence hashes/current candidate binding: `PENDING`

Do not claim blanket near-10/10 or default Press Certified until the campaign passes.

### Specialized modes

List each public mode and its independent qualification state. Any unqualified mode must remain server fail-closed.

## 9. Quality-state integrity

Prove on a controlled manuscript:

- generation completion displays Draft, not Certified: `PENDING`
- typography-only success does not claim publication certification: `PENDING`
- Verified requires applicable current-scope attestations: `PENDING`
- Press Certified requires strict 95/98/zero-warning contract: `PENDING`
- manuscript edit invalidates stale hash-bound certification: `PENDING`
- factual governed content cannot publish without required evidence: `PENDING`
- technical code-bearing content cannot publish with stale/missing code audit: `PENDING`

## 10. Export evidence

| Format | Entitled tiers | Generated real-book fixture | Conformance/readability | Commercial claim allowed |
|---|---|---|---|---|
| PDF | PENDING | PENDING | PENDING | PENDING |
| EPUB | PENDING | PENDING | epubcheck PENDING | PENDING |
| DOCX | PENDING | PENDING | PENDING | PENDING |
| KDP PDF | PENDING | PENDING | embedded-font + KDP Previewer PENDING | NO-GO until proven |

Unicode regression fixture must include at least `ɛ ɔ α β ∑ ∫ ≤ ≥` for PDF/KDP evidence.

## 11. Publishing services / ISBN

For each enabled package:

- billing order paid state != fulfillment-complete state: `PENDING`
- work order created idempotently: `PENDING`
- deliverables tracked: `PENDING`
- validation gate blocks premature ISBN assignment: `PENDING`
- format-specific ISBN assignment count correct: `PENDING`
- exact edition/publication identity recorded: `PENDING`
- refund/cancellation semantics proven: `PENDING`

Assisted Publishing Launch remains closed until human staffing, service scope and fulfillment lifecycle are proven.

## 12. Marketplace and creator payouts

Keep `GA_MARKETPLACE_PAYMENTS_ENABLED` and `GA_MARKETPLACE_PAYOUTS_ENABLED` false unless all items below pass:

- storefront purchase lifecycle: `PENDING`
- immutable creator earnings ledger: `PENDING`
- payout candidate/balance/reservation: `PENDING`
- Stripe Connect transfer: `PENDING`
- Stripe-success/DB-ack recovery: `PENDING`
- long-lived ambiguous transfer reconciliation: `PENDING`
- transfer reversal/event reconciliation: `PENDING`
- duplicate/replay idempotency: `PENDING`
- refund-after-payout accounting policy: `PENDING`

## 13. Teams

Keep `GA_TEAMS_SUBSCRIPTION_ENABLED=false` until:

- organization subscription authority: `PENDING`
- five included seats: `PENDING`
- member inheritance: `PENDING`
- pooled project/AI/media usage: `PENDING`
- concurrent reservation cannot overdraw: `PENDING`
- invite/remove/cancel E2E: `PENDING`
- extra-seat commercial semantics: `PENDING`

## 14. Observability and operations

- Browser Sentry/telemetry production configuration: `PENDING`
- Edge Sentry/telemetry production configuration: `PENDING`
- Release value/source maps where applicable: `PENDING`
- Correlation ID visible on critical flows: `PENDING`
- Expected cron jobs active: `PENDING`
- Backup/PITR capability confirmed: `PENDING`
- Restore rehearsal: `PENDING`
- Source/Edge/frontend rollback rehearsal: `PENDING`
- Commercial kill-switch rehearsal: `PENDING`
- `PRODUCTION_RECOVERY_RUNBOOK.md` reviewed: `PENDING`

## 15. Legal/commercial review

Not legal advice. Record counsel/business approval for:

- contracting entity/provider information/legal notice as required: `PENDING`
- Privacy/Terms alignment with actual processors/product behavior: `PENDING`
- marketplace seller agreement before seller commerce: `PENDING`
- publishing-services agreement before service billing: `PENDING`
- add-on validity disclosure: `PENDING`

## 16. Final release decision

### Surface decisions

- Free/core: `NO-GO / GO WITH RESTRICTIONS / GO`
- Creator subscription: `NO-GO / GO`
- Pro subscription: `NO-GO / GO`
- Teams: `NO-GO / GO`
- Publishing services: `NO-GO / GO`
- Marketplace payments: `NO-GO / GO`
- Creator payouts: `NO-GO / GO`
- KDP-ready claim: `NO-GO / GO`
- Standard Text near-10/10 qualification: `NO-GO / GO`

### Sign-off

- Engineering: `PENDING`
- Security: `PENDING`
- Billing/financial operations: `PENDING`
- Publishing operations: `PENDING`
- Content quality: `PENDING`
- Legal/business review where applicable: `PENDING`

Final evidence pack commit/SHA: `PENDING`
