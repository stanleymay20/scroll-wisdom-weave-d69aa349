# ScrollLibrary

**AI Publishing OS · Structured Knowledge Workflows · Production-Grade Publishing Automation**

ScrollLibrary is a React/TypeScript + Supabase platform for AI-assisted reading, learning, manuscript development and publishing workflows.

The engineering focus is broader than text generation: the system combines **structured AI outputs, knowledge extraction, interactive assessment, database-backed publishing workflows, export/conformance checks, security controls and reproducible CI**.

## Recruiter quick scan

**What this repository demonstrates**

- React + TypeScript application engineering;
- Supabase/PostgreSQL data architecture and Edge Functions;
- structured AI/tool-call workflows instead of free-form parsing alone;
- knowledge-graph extraction and graph-driven question generation;
- interactive Q&A and mastery-assessment workflows;
- authentication, authorization and Row-Level Security testing;
- database migration-safety checks;
- end-to-end browser validation with Playwright;
- dependency/security scanning and CodeQL;
- EPUB archive conformance validation against the official EPUB checker;
- release/build provenance and production-readiness documentation.

## AI workflow examples

Several server-side AI flows require machine-readable outputs before downstream logic is allowed to continue.

For example, the knowledge-graph extraction path validates the presence of tool-call arguments and fails if the model does not return structured output. Other functions use structured generation for interactive questions and assessment workflows.

```text
Content / manuscript
        ↓
Server-side AI request
        ↓
Structured tool output
        ↓
Validation / parsing
        ↓
Knowledge or assessment representation
        ↓
Application workflow
```

This reduces reliance on brittle free-form text parsing and makes failures visible to the application.

## Platform architecture

```text
React + TypeScript client
        ↓
Authentication / application state
        ↓
Supabase Postgres + RLS
        ↓
Edge Functions / AI workflows
        ↓
Publishing, learning and creator operations
        ↓
Export / conformance / release checks
```

**Frontend:** React · TypeScript · Vite · Tailwind CSS

**Backend/data:** Supabase · PostgreSQL · Edge Functions · Auth · RLS

**Quality/security:** Bun · Playwright · CodeQL · dependency audit · secret scan · migration-safety checks

## Production-readiness evidence

The repository contains permanent gates for more than compilation alone:

- **CI:** type checking, linting, tests, Edge Function checks, migration safety and build validation;
- **Real auth/RLS E2E:** Playwright tests against local Supabase services;
- **Dependency Review:** pull-request dependency analysis;
- **CodeQL:** static security analysis;
- **EPUB Conformance:** final generated EPUB archives are checked with the official validator;
- **Secret/dependency audits:** committed-secret scanning and production dependency policy;
- **Bundle/release checks:** build-budget and release-provenance controls.

See [`docs/PRODUCTION_READINESS.md`](./docs/PRODUCTION_READINESS.md) and [`.github/workflows/`](./.github/workflows/) for the current gates and their evidence boundaries.

Passing repository gates demonstrates the conditions they actually test; it is not presented as blanket certification of every production environment.

## Security model

- local `.env` files remain untracked;
- service-role and privileged secrets must stay server-side;
- browser-visible configuration is separated from privileged credentials;
- user-controlled text and external URLs require safe rendering/validation;
- authentication and RLS behavior are exercised in real browser/database E2E tests;
- database changes pass migration-safety checks before merge.

## Local development

**Requirements:** Bun 1.2.23 and a Supabase project.

```bash
cp .env.example .env
bun install --frozen-lockfile
bun run dev
```

Run the main quality gate locally:

```bash
bun run ci
```

Or individually:

```bash
bun run typecheck
bun run lint
bun run test
bun run build
```

## Supabase

- migrations and Edge Functions live under `supabase/`;
- production deployment should select its target project explicitly;
- functions with `verify_jwt = false` must authenticate the caller, validate an external signature, or be intentionally public;
- local CLI state under `supabase/.temp/` and `supabase/.branches/` is ignored.

## Alerting

Financial events at `error` or `critical` severity, and any dead-lettered event,
are dispatched to a webhook as they are written. Set the `ALERT_WEBHOOK_URL`
secret on the Supabase project to turn this on:

```bash
supabase secrets set ALERT_WEBHOOK_URL="https://hooks.example.com/..."
```

It posts plain JSON, so a Slack or Discord incoming webhook, a PagerDuty Events
API endpoint, or any HTTP receiver works. **Until it is set, nothing pages** —
the events are still recorded in `financial_events`, and each one that would
have alerted logs `[alert:unconfigured]`.

Alerts carry the event type, severity, actor, correlation id and Stripe event
id. They deliberately exclude the event `payload`, which can contain customer
data; investigate by joining on the correlation id in `financial_events`.

Dispatch is best-effort and never blocks the caller — an alerting failure must
not become a payment failure.

## Repository status

This is the **canonical ScrollLibrary repository** in the portfolio. Historical `scroll-wisdom-weave*` siblings are preserved as lineage snapshots rather than used for active development.

The project is maintained as an engineering system, not merely as a generative-AI demo: AI behavior, data integrity, security, publishing conformance and release evidence are treated as separate concerns.
