# ScrollLibrary Public-Release E2E Pipeline Matrix

**Authority:** release-hardening branch evidence, not feature existence.

A pipeline is **GREEN** only when every evidence class required for that journey is satisfied.  
A deterministic browser fixture proves UI wiring; it does **not** prove Supabase, Stripe, AI, storage, email, or a third-party API.

Legend: **PASS** = evidence exists and is release-gated; **PARTIAL** = useful evidence exists but a required layer is missing; **MISSING** = no adequate E2E proof; **N/A** = that evidence class is not required.

| ID | User/business journey | Deterministic browser | Real Supabase / deployed integration | DB/security invariant | External/sandbox proof | Current gate |
|---|---|---|---|---|---|---|
| P01 | Public shell, legal routes, protected-route fail-closed, 404 | PASS — `public-smoke.spec.ts` | N/A | N/A | N/A | PASS |
| P02 | Sign in → persisted session → protected route → RLS isolation | PARTIAL | PASS — `real-supabase.spec.ts` | PASS | N/A | PASS |
| P03 | Subscription checkout → Stripe webhook → plan entitlement → billing portal/cancel | MISSING | MISSING | PARTIAL — webhook/financial boundary hardening | MISSING Stripe test-mode lifecycle | BLOCK |
| P04 | Generate book → job/book/chapters → library → book route | PASS — generation UI contract | PARTIAL | PASS — atomic quota reservation | MISSING real AI/provider full-book run | BLOCK |
| P05 | Upload TXT/DOCX/PDF/URL → extraction → process-document → library → reader | PASS — real browser extraction for TXT/DOCX/PDF | MISSING full local/deployed ingestion | PARTIAL — server auth/rate-limit/rollback | N/A | BLOCK |
| P06 | Edit/regenerate chapter → persisted version → reader → publication state invalidation | PASS — revision dialog/edit-intent browser contract | PARTIAL — real AI regeneration still unproven | PASS/PARTIAL — server edit-intent + persisted-content ratchet; hash-bound attestations stale automatically | N/A | BLOCK |
| P07 | Research/citations → duplicate preview/import → evidence/source persistence | PASS — citation import UI | MISSING research-to-persisted-evidence path | PARTIAL | MISSING provider-backed research proof | BLOCK |
| P08 | Cover/media → storage → rights provenance → current publication hash | PASS — custom-cover rights confirmation/upload/registration browser contract | PARTIAL — real storage + generated-cover provider execution unproven | PASS — generated/custom provenance, active-cover hash binding, certified-cover immutability ratchet | MISSING real image-provider/storage round trip | BLOCK |
| P09 | Editorial → proofread → QA → production render → final certification | PASS — browser drives full orchestrator | PARTIAL | PASS — scope-bound attestation/hash tests | MISSING production-like real artifact run | BLOCK |
| P10 | Publisher identity/ISBN → independent review → assignment → atomic verified publication mint | PASS — canonical publish + admin ISBN UI surfaces | PARTIAL — Lovable Test convergence still in progress | PASS/IN-PROGRESS — deep SQL governance + mint gates | N/A | BLOCK |
| P11 | Export PDF/EPUB/DOCX → validation → artifact → download | PASS — non-placeholder PDF browser download | PARTIAL | PASS — export integrity + EPUB conformance | MISSING retailer/platform preview proof | BLOCK |
| P12 | Schedule release → scheduler/cron → materialized public release | MISSING browser schedule lifecycle | MISSING deployed scheduler proof | PASS — `test-release-materialization.sql` | N/A | BLOCK |
| P13 | Creator listing → storefront → sample reader | PASS | PARTIAL | PASS RLS/read isolation | N/A | PASS for beta surface |
| P14 | Buy book → Stripe → purchase row → entitlement → full reader | PASS checkout UI wiring/idempotency | MISSING real Stripe/local webhook browser flow | PASS — sale/entitlement ledger lifecycle | MISSING Stripe test-mode round trip | BLOCK |
| P15 | Sale → earnings ledger → partial/full refund → exact reversal | N/A | MISSING real Stripe refund webhook flow | PASS — partial-refund/idempotency/replay contracts | MISSING Stripe test-mode partial refund | BLOCK |
| P16 | Creator payout profile → Stripe Connect onboarding → readiness → payout surface | MISSING | MISSING | PASS/PARTIAL — server-owned payout surface | MISSING Stripe Connect sandbox | BLOCK |
| P17 | Export bundle → Gumroad/Shopify connection/publish → external publication record | MISSING | MISSING | PARTIAL | MISSING provider sandbox | BLOCK |
| P18 | Library → reader → generated chapter → reload → highlight/profile isolation | N/A | PASS — `real-reader-library.spec.ts` | PASS | N/A | PASS |
| P19 | Reader → knowledge graph / Socratic Q&A → persisted learning state | MISSING | MISSING | PARTIAL | MISSING provider-backed AI proof | BLOCK |
| P20 | Assessment session → mastery → durable assessment state | MISSING | MISSING | PARTIAL | N/A | BLOCK |
| P21 | Mastery/eligibility → certificate issuance → retained credential | MISSING issuance journey | MISSING | PASS/PARTIAL — certificate authority/retention SQL | N/A | BLOCK |
| P22 | Certificate → public verification / batch verification | MISSING | MISSING | PARTIAL | N/A | BLOCK |
| P23 | Privacy → data export + account deletion + retained-certificate semantics | PARTIAL — deletion UI | PARTIAL | PASS — account deletion/certificate retention | N/A | BLOCK until data export is E2E |

## Secondary / deliberately non-GA surfaces

These must be either E2E-proven **or explicitly disabled/removed** before they are presented as supported public features:

- ownership transfer (currently intended to remain GA-disabled until its workflow is proven);
- cinematic/chapter video generation and narration;
- study-music generation;
- advanced creator/business analytics;
- PWA/offline recovery;
- operational ledger backfill/reconciliation;
- admin refund execution UI;
- direct identifier-resolution API operational SLA.

## Release rule

1. A source file or Edge Function existing is **not** E2E evidence.
2. A mocked browser test cannot satisfy a required real-backend or external-provider column.
3. A SQL invariant cannot prove a UI journey.
4. A provider sandbox run must use the exact release commit/configuration.
5. No pipeline may be marked PASS based on an older commit after publication/security-affecting code changes.
6. Any public feature without a complete required evidence chain is either **blocked from GA** or **disabled in the public UI**.
7. Live/production remains out of scope until the same reviewed migrations and exact-head staging evidence are green.
