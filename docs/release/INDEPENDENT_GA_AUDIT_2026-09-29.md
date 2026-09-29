# Independent GA audit — 29 September 2026

Status: NO-GO. Audit remains incomplete; no release authorization is issued.
Reviewed main: f1ccf1b0b07a20c7bac51813e329283986c4643c.
PR #102 remains open at 0625f94d849c24cd7186b536f4241c6657927ddb.

## Confirmed findings before changes

P1 R01: Production release.json reports commit=null, buildTime=2026-09-29T11:27:56.519Z, fingerprint sha256:14a797c03f1e2feec03207ca9e1d925d1955be6daa597d3084bbd28ba4bd03bc (1124 files). Reviewed main fingerprint is sha256:5cd51a9b9ea01cb414064515bdc9ed68dc41d7b19fd882c150b74a88c245c89c (1144 files). Production cannot be certified as this main. Its manifest has no artifact hashes. Hosting controls and rollback are unverified.

P1 R02: Production generation-worker POST {} returns HTTP 404 NOT_FOUND. Current main generate-book requires this worker. Deploying only the frontend/current generate-book would leave jobs unable to draft/resume.

P1 R03: generate-chapter OCR branch executes before authentication and spend controls. Single anonymous invalid-image probe returned HTTP 200 ocrResult instead of 401. Source directly sends imageUrl to paid gateway. Unauthenticated cost amplification is possible; do not flood production to demonstrate it.

P1 R04: generate-chapter authenticates but does not enforce the specialized-mode release policy on persisted book_type. Legacy specialized books and direct calls bypass generate-book's GA gate. GA_ADVANCED_AUTHORING_ENABLED is a global feature switch, not independent empirical qualification.

P1 R05: Worker lease is verified only at request entry. Long-running chapter saves UPDATE chapters WHERE id without lease or revision fencing. An expired worker can overwrite a newer retry/user edit after another worker acquires the job. Existing RPC finish fencing protects job progress, not content.

P1 R06: generate-chapter uses process-local checkRateLimit; cold starts/parallel workers reset it. Shared enforceDurableRateLimit returns null (allow) on RPC error, missing row or exception. The durability scanner recognizes enforceRateLimit but misses checkRateLimit.

P1 R07: Current build/provenance code accepts null/non-SHA identities and arbitrary VITE_BUILD_ID; production verification permits null commit with source fingerprint and omits Strict Null/Dependency Review. This does not satisfy the requested exact-SHA release policy.

P2 R08: Workbook/Contract6/comic contract gates permit admin overrides. Comic images may fail while successful script persists. These are not empirical qualification passes.

P2 R09: Worker no-next-chapter branch hands off to quality_review even if expected chapter count is missing. QA may later block publication, but GA editorial pipeline is disabled and draft progress can mislead. No server watchdog redispatch was found; stale sweeper marks jobs partial, requiring user resume.

## Existing exact-main check evidence

CI typecheck/lint/test/security/build/e2e/edge-functions/migration-safety/schema replay and lint: success.
CodeQL: success. EPUBCheck 5.3.0: success. GA Real E2E: success. Admin Financial Boundary/cors-boundary: success.
Stripe workflow: success, but lifecycle job SKIPPED. No payment lifecycle proof.
Strict Null Ratchet and Dependency Review: PR-only; no checks on this main SHA.
Interactive Voice Security: path-filtered; no run on this SHA.
Branch endpoint says protected=true but legacy status enforcement off/empty; detailed protection 403 and rules endpoint unsupported. Effective ruleset/bypass controls unverified; do not claim protections are absent.

## Access limitations

Connected Supabase account lists no ScrollLibrary project. Production DB migrations/RLS/drift, edge source and environment configuration cannot be read through this connector. No two authorized production test users or admin session available. Authenticated IDOR, actual full-book campaigns, asset access and production read/quiz/certificate remain untested. Public browser Generate redirects to /auth. Docker is absent locally. No claim of a fresh local migration replay or full production E2E is made.

## Release policy

Only Standard Text -> Read -> Quiz -> learning-record Certificate is a potential GA scope, subject to closing every P1 and obtaining missing evidence. All ten specialized modes, paid financial writes, advanced authoring, publication minting/export/media/voice remain disabled pending independent qualification and applicable lifecycle proof.

## Candidate remediation and local evidence

Separate audit branch; changes are not deployed or merged. OCR is now behind authenticated, durable metering and the advanced-authoring gate. Both creation and chapter generation require an independent public specialized switch/allow-list or canonical-admin qualification access. Persisted generated content cannot be rewritten by omitting request flags in GA. A service-only SQL writer atomically locks the generation job, checks current lease/owner, locks the chapter and compares expected content before saving. All three chapter pipelines call it. Shared durable limits return 503 on RPC errors/malformed results. Production builds reject unavailable/non-SHA or checkout-disagreeing identity; plain Vite builds now emit full artifact hashes. Strict Null runs on main; production verification requires a real matching SHA. Missing chapter counts cannot enter the draft handoff branch.

Validation: 319 Vitest tests; 18 adversarial handler tests; 314 shared Deno tests; changed generation handlers typecheck; strict-null; secret-pattern, financial-edge, contract parity, reachability, Deno coverage, bundle and dependency gates passed locally. An embedded PostgreSQL test passed expired/replaced lease, conflicting revision, duplicate claim/write, unauthorized owner and browser EXECUTE-denial scenarios. This embedded schema fixture is not a complete Supabase replay or production RLS proof. A fresh CI migration replay is still required.

Independent all-entrypoint Deno check found one publication-certificate BodyInit type error outside the curated CI list; fixed by copying PDF bytes into an ArrayBuffer. No public launch of this deferred endpoint is authorized.

Browser gate attempted: Chromium CDN delivered corrupt/empty archives; 21 tests could not launch a browser and 12 deferred-feature tests were skipped. This is an environment failure, not 21 demonstrated product failures. Production browser home/auth render, accessible controls and generation-to-auth redirect were observed; authenticated/mobile/a11y end-to-end tests remain unproven.

Practical secret scan examined 25,683,114 bytes of fetched history added lines for private keys, Supabase secrets, Stripe secrets, GitHub tokens, Google API keys and AWS access IDs; no history candidates in those categories. A working-tree Stripe pattern hit is a synthetic publish-validation fixture, not a live secret. This is not a guarantee against all credential formats or unfetched/deleted refs.

P2: dependency audit carries 13 reviewed advisory exceptions expiring 2026-10-06 (22 high findings across dependency paths). Assess reachability and remediate before expiry; a green exception gate does not mean zero vulnerabilities.
P2: renderer/software identity is not included in production attestation scope; source inspections found fileHash stored, but finalizer looks up current manuscript scope. A renderer-code change alone does not automatically invalidate a historical production PASS. Must close before enabling canonical publication.
P2: generation jobs have manual lease-expiry resume, not demonstrated automatic redispatch after crash; no fresh full-book provider campaign/50–100 chapter soak was run.
P3: plain-build bundle warnings and legacy lint baseline remain; route lazy loading exists but performance/mobile measurements are incomplete.

## Final release checklist (all required before GO)

- [ ] Reviewed immutable candidate SHA and exact-head mandatory gates all pass; PR merge-test SHA is not substituted for the candidate.
- [ ] Fresh complete Supabase migration replay and new fencing SQL assertions pass on exact candidate.
- [ ] Production migration inventory/catalog/RLS/definer grants match reviewed schema; deployed Edge sources match candidate.
- [ ] Deploy generation-worker and fenced RPC with compatible migration first; verify health and rollback can run with additive schema.
- [ ] Production release commit and source/artifact hashes match reviewed immutable build.
- [ ] Prove branch/deployment rules, bypass restrictions and rollback controls with hosting/admin APIs.
- [ ] Two-user and admin adversarial production/staging RLS/ownership probes pass.
- [ ] Real Standard Text full-book campaign includes completion/content checks and browser-close/crash/retry cases.
- [ ] Read -> Quiz -> Certificate passes against the deployed release; server answer/certificate authority verified.
- [ ] All ten specialized modes remain closed; PR #102 reviewed/rebased independently; no empirical qualification assumed.
- [ ] Payments stay disabled; Stripe lifecycle cannot be called passed when skipped.
- [ ] Keyboard/mobile/accessible error/progress/retry journeys and outage tests pass.

## Fresh CI follow-up

The initial audit PR run completed a fresh Supabase migration replay, database lint and the real PostgreSQL chapter-fencing regression script successfully. Browser E2E also passed in GitHub, resolving the local Chromium launch limitation for deterministic tests (not live authenticated journeys).

Fresh CI then correctly rejected two newly published high-severity undici advisories affecting locked 7.29.0. Override/lock updated to patched 7.29.1 without adding an exception. The static chapter-regeneration scanner was updated to require the fenced RPC instead of the removed unsafe direct UPDATE.

P1 R10 (release assurance): default PR checkout tests GitHub's synthetic merge commit, while workflow head_sha identifies the candidate branch. Mandatory PR gates now explicitly checkout pull_request.head.sha (or github.sha on push/dispatch). Merge-result and candidate-head evidence must remain distinct. All new candidate gates must rerun. Hosting/protection enforcement remains unverified.

Additional payload-path review found legacy academicMode=true could route a persisted text chapter into academic generation despite a text-only type gate. The candidate now gates the actual academic routing mode; creation also independently checks academic/bestseller legacy flags. A direct-handler regression rejects this without provider calls.
