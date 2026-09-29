# ScrollLibrary Public-Release E2E Pipeline Matrix

**Authority:** release-hardening branch evidence, not feature existence.

A pipeline is **GREEN** only when every evidence class required for that journey is satisfied.  
A deterministic browser fixture proves UI wiring; it does **not** prove Supabase, Stripe, AI, storage, email, or a third-party API.

Legend: **PASS** = evidence exists and is release-gated; **PARTIAL** = useful evidence exists but a required layer is missing; **MISSING** = no adequate E2E proof; **N/A** = that evidence class is not required.

| ID | User/business journey | Deterministic browser | Real Supabase / deployed integration | DB/security invariant | External/sandbox proof | Current gate |
|---|---|---|---|---|---|---|
| P01 | Public shell, legal routes, protected-route fail-closed, 404 | PASS — `public-smoke.spec.ts` | N/A | N/A | N/A | PASS |
| P02 | Sign in → persisted session → protected route → RLS isolation | PARTIAL | PASS — `real-supabase.spec.ts` | PASS | N/A | PASS |
| P03 | Subscription checkout → Stripe webhook → plan entitlement → billing portal/cancel | Deterministic wiring exists, but new paid upgrade CTAs are disabled in GA | N/A for GA while writes are disabled; existing subscription read/portal paths remain available | PASS for fail-closed release switch + webhook/financial boundary | Sandbox lifecycle remains required before enabling paid writes | DISABLED for GA; production must prove `ga_payments_disabled` or exact-head Stripe lifecycle must pass |
| P04 | Generate book → job/book/chapters → library → book route | PASS — generation UI contract | PARTIAL | PASS — atomic quota reservation | MISSING real AI/provider full-book run | BLOCK |
| P05 | Upload TXT/DOCX/PDF/URL → extraction → process-document → library → reader | Existing deterministic evidence retained | MISSING full deployed ingestion | PARTIAL — server auth/rate-limit/rollback | N/A | DISABLED for GA: route, navigation, and homepage ingestion claims removed |
| P06 | Edit/regenerate chapter → persisted version → reader → publication state invalidation | Existing deterministic revision contract retained | PARTIAL — real AI regeneration unproven | PASS — server rejects regeneration while the GA advanced-authoring switch is closed | N/A | DISABLED for GA at render and Edge Function boundary |
| P07 | Research/citations → duplicate preview/import → evidence/source persistence | Existing deterministic evidence retained | MISSING provider-backed persisted research path | PARTIAL | MISSING provider-backed research proof | DISABLED for GA: advanced academic/research generation and related direct routes are outside launch scope |
| P08 | Cover/media → storage → rights provenance → current publication hash | Existing cover safety evidence retained | PARTIAL — provider/storage round trip unproven | PASS — provenance and certified-cover immutability contracts retained | MISSING real image-provider/storage round trip | DISABLED for GA: cover generation/upload controls and custom-cover generation inputs are removed/gated |
| P09 | Editorial → proofread → QA → production render → final certification | Existing deterministic orchestrator evidence retained | PARTIAL | PASS — scope-bound attestation/hash tests retained | MISSING production-like real artifact run | DISABLED for GA: editorial automation and publication-orchestration route are gated off |
| P10 | Publisher identity/ISBN → independent review → assignment → atomic verified publication mint | Historical deterministic/governance evidence retained | Hosted end-to-end publisher/ISBN mint remains unproven | PASS — governance invariants remain source-controlled; `publish-work` now fails closed unless `GA_PUBLICATION_MINT_ENABLED` is explicitly opened | N/A | DISABLED for GA: publisher/ISBN panels and canonical publication minting are absent from the launch UI and the server mint boundary is closed |
| P11 | Export PDF/EPUB/DOCX → validation → artifact → download | Existing renderer evidence retained | PARTIAL | PASS — export integrity + EPUB conformance retained | MISSING retailer/platform preview proof | DISABLED for GA: export controls and export-job route are gated off |
| P12 | Schedule release → scheduler/cron → materialized public release | Existing deterministic scheduling evidence retained | Production cron/materializer repaired and zero-work smoke verified 2026-09-29; due-item hosted E2E remains outstanding | PASS — restrictive entitlement RLS, canonical cron, due/future/lapsed/idempotency tests | N/A | DISABLED in GA UI until due-item hosted E2E is verified; operational materializer remains healthy for existing data |
| P13 | Creator listing → storefront → sample reader | PASS | PARTIAL | PASS RLS/read isolation | N/A | PASS for beta surface |
| P14 | Buy book → Stripe → purchase row → entitlement → full reader | Free-unlock path remains available; paid CTA is disabled in GA | N/A for new paid purchases while writes are disabled | PASS — free entitlement path + paid sale/ledger contracts retained | Sandbox lifecycle required before paid purchases reopen | PAID PATH DISABLED for GA; free storefront unlock remains available |
| P15 | Sale → earnings ledger → partial/full refund → exact reversal | N/A | No new paid GA sales can be created; live webhook remains enabled for reconciliation of existing/legacy events | PASS — refund/idempotency/replay contracts retained | Sandbox lifecycle required before new paid sales reopen | NEW PAID SALES DISABLED for GA; reconciliation remains operational |
| P16 | Creator payout profile → Stripe Connect onboarding → readiness → payout surface | Existing deterministic onboarding wiring retained | N/A for GA while Connect writes are disabled; manual payout details remain available | PASS — Connect account fields remain server-owned and onboarding Edge Function fails closed | Sandbox/hosted onboarding proof required before reopening | STRIPE CONNECT DISABLED for GA |
| P17 | Export bundle → Gumroad/Shopify connection/publish → external publication record | MISSING | MISSING | PARTIAL | MISSING provider sandbox | DISABLED for GA: third-party publishing actions are absent from the launch render |
| P18 | Library → reader → generated chapter → reload → highlight/profile isolation | N/A | PASS — `real-reader-library.spec.ts` | PASS | N/A | PASS |
| P19 | Reader → knowledge graph / Socratic Q&A → persisted learning state | MISSING | MISSING | PARTIAL | MISSING provider-backed AI proof | DISABLED for GA by reader feature gates and direct-route gating |
| P20 | Assessment session → mastery → durable assessment state | N/A — exercised through authenticated API authority, not mocked browser scoring | PASS — `test-mastery-certificate-e2e.mjs` drives real `assessment-session` answer locking, server scoring, mastery persistence, and trusted integrity evidence against the fully migrated disposable Supabase stack | PASS — browser roles cannot write authoritative quiz/integrity/mastery evidence | N/A | PASS for the server-authoritative assessment state machine; external AI question-generation quality remains separately provider-dependent |
| P21 | Mastery/eligibility → certificate issuance → retained credential | PASS — eligible issuance + server-rejection browser contracts; learner route protected | PASS — `test-mastery-certificate-e2e.mjs` creates per-chapter reading/assessment evidence, invokes the real certificate authority, and receives a mastery credential; account-deletion E2E separately proves retained/revoked semantics | PASS — server re-derives reading/ARC/integrity evidence and browser roles cannot mint authoritative evidence | N/A | PASS |
| P22 | Certificate → public verification / batch verification | PASS — valid and not-found public verification render server status | PASS for single-certificate verification — `test-mastery-certificate-e2e.mjs` issues a real credential, verifies it publicly as valid, mutates the certified book, and verifies fail-closed provenance invalidation | PASS for single verification — live status is bound to recomputed book SHA-256 + assessment/coverage/integrity evidence; batch verification remains a secondary surface | N/A | PASS for GA single-certificate verification; batch verification remains outside the core launch journey |
| P23 | Privacy → data export + account deletion + retained-certificate semantics | PASS — self-service Settings/export/delete surfaces | PASS — `test-data-export-e2e.mjs` proves authenticated user-bound portability with per-chapter progress and credential redaction; deletion E2E proves retained/revoked certificate semantics | PASS — export is fail-closed and retained-credential contract is database-gated | N/A | PASS, release-gated by exact-head `GA Real E2E` |

## Secondary / deliberately non-GA surfaces

These must be either E2E-proven **or explicitly disabled/removed** before they are presented as supported public features.

GA launch state:
- ownership transfer — **DISABLED** at the database mutation boundary;
- cinematic/chapter video and interactive voice — **DISABLED** by GA PMF feature gates;
- study-music generation — **DISABLED** by GA PMF feature gates;
- advanced creator intelligence/business analytics — **DISABLED** at route registration; core marketplace analytics remain in beta scope;
- PWA/offline recovery — **DISABLED** for GA: no service worker/install manifest is emitted, install/update routes are removed, and older service-worker registrations are retired;
- operational ledger backfill/reconciliation — internal-only, not a supported public GA surface;
- admin refund execution UI — internal-only, not a supported public GA surface;
- direct identifier-resolution API operational SLA — not advertised as a public GA commitment;
- upload/ingestion, chapter regeneration, provider-backed covers, editorial automation, exports, serialized releases, research/citation tooling, knowledge graph/Q&A, external publishing, paid checkout, and Stripe Connect — **DISABLED** from the GA public surface until their corresponding evidence gates pass.

## Stripe test-mode evidence

`stripe-test-mode.yml` runs `scripts/test-stripe-lifecycle.mjs` against real Stripe test mode and a disposable local Supabase stack, with webhooks delivered by the Stripe CLI. Without the `STRIPE_TEST_SECRET_KEY` repository secret its lifecycle job is **skipped**, and a skipped job is not evidence. P03, P14, P15 and P16 move only on a green run of that job at the exact release commit; its `summary.json` artifact is the record.

## Release rule

1. A source file or Edge Function existing is **not** E2E evidence.
2. A mocked browser test cannot satisfy a required real-backend or external-provider column.
3. A SQL invariant cannot prove a UI journey.
4. A provider sandbox run must use the exact release commit/configuration.
5. No pipeline may be marked PASS based on an older commit after publication/security-affecting code changes.
6. Any public feature without a complete required evidence chain is either **blocked from GA** or **disabled in the public UI**.
7. Production certification additionally requires `GA Production Verification` to match the deployed source fingerprint to the exact release head and to prove the required exact-head workflows actually ran.
