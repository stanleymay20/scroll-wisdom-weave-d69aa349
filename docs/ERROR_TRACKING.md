# Error Tracking — Sentry

Sentry is the approved GA error-tracking provider for ScrollLibrary. The integration is intentionally **disabled by default**: no DSN means no Sentry SDK initialization and no error-reporting network traffic.

## Project layout

Use one Sentry organization with two projects:

- `scrolllibrary-web` — React/Vite browser errors.
- `scrolllibrary-edge` — Supabase/Deno Edge Function errors.

Prefer Sentry's EU/DE data region for the organization when that matches the deployment's data-residency requirements.

## Runtime configuration

### Browser

Set this deployment variable in the web host:

```text
VITE_SENTRY_DSN=<scrolllibrary-web DSN>
```

`VITE_SENTRY_DSN` is read at build time by Vite. If it is absent or blank, `src/lib/errorTracking.ts` does not import or initialize Sentry.

Browser events use the immutable application `__BUILD_ID__` as the Sentry release and Vite's mode as the environment.

### Supabase Edge Functions

Configure these as Supabase runtime secrets/configuration; do not commit live values:

```text
SENTRY_DSN=<scrolllibrary-edge DSN>
SENTRY_ENVIRONMENT=staging|production
SENTRY_RELEASE=<immutable git SHA or deployment release id>
```

Only `SENTRY_DSN` is required to turn reporting on. If it is absent or blank, the Deno SDK is not dynamically imported.

## GA privacy posture

The GA integration is error-only. It deliberately does not enable Session Replay or performance tracing. `sendDefaultPii` is disabled, user identity is removed, request bodies and cookies are removed, authorization/API-key headers are stripped, and query strings/fragments are removed from reported URLs.

Do not add user email, auth tokens, book manuscript contents, prompts, uploaded document contents, payment payloads, or other customer content to Sentry contexts or tags.

## Source maps

Release tagging is enabled, but source-map upload is not configured yet because it requires Sentry organization/project identifiers plus a CI auth token. Add that only after the owner has created the Sentry projects and stored the CI token in repository/deployment secrets. Never put a Sentry auth token in Vite variables or committed files.

## Staging acceptance check

Before GA, configure both staging DSNs and produce one controlled browser exception and one controlled Edge Function exception. Verify in Sentry that:

1. the events land in the correct web/edge projects;
2. environment and release values identify the exact staged commit;
3. browser and Edge events contain no authorization/cookie/API-key headers, request bodies, user identity, or URL query parameters;
4. the application and Edge request still succeed/fail according to their normal behavior if Sentry is unavailable.

Record the exact commit SHA and evidence alongside the other release-readiness evidence required by `docs/PRODUCTION_READINESS.md`.
