# Plan: P04 — Real provider-backed generation smoke (diagnostics only, no code edits)

## Feasibility verdict: YES — all required capabilities exist

Verified against the actual function code and available tools:

1. **Disposable user creation** — possible without any secret. The Test backend's auth signup endpoint (`/auth/v1/signup`) accepts the publishable anon key, which is not a secret. The signup response returns a real access token. No service-role key is needed or accessible (it is not available on Lovable Cloud, and none will be fabricated).
2. **Authenticated invocation of the real provider path** — `generate-book/index.ts` and `generate-chapter/index.ts` both call `requireUser(req)` (verified at generate-book line 70) and use the server-side managed `LOVABLE_API_KEY` (generate-book line 197, generate-chapter line 1947). The key never leaves the server. Invocation uses `supabase--curl_edge_functions` with the disposable user's access token in the Authorization header.
3. **Persistence verification** — `supabase--read_query` on Test confirms the book row, at least one chapter row with real (non-placeholder) generated content, and the library/ownership records.
4. **Cleanup** — `supabase--run_sql` on Test deletes the fixture book, chapters, library rows, and the disposable auth user, returning counts so deletion is verified.

## Execution steps (Test database only; Live untouched)

1. Sign up a disposable user (`ga-p04-smoke-<timestamp>@example.invalid`) via the Test auth endpoint; capture the access token in-memory only (never logged or echoed).
2. Invoke `generate-book` for a minimal free-tier book (free tier allows 1 book/day, up to 5 chapters — request 1–2 chapters to keep the smoke fast and cheap).
3. Invoke `generate-chapter` for chapter 1 if generate-book does not persist chapter content itself.
4. Verify via read queries: book exists with correct `creator_id`/`user_id`, chapter exists with substantial non-placeholder content, library record present.
5. Clean up: delete chapters, book, library rows, and the auth user; verify zero remaining rows.
6. Report: pass/fail per step, with the exact error if any step fails.

## Known risk that may legitimately fail the smoke

The workspace AI spending limit was reached earlier this session (`403 credit_limit_reached`). If it is still in effect, step 2/3 will fail with that 403 — that is a valid diagnostic result (provider path correctly reached and correctly denied), not a code bug, and it will be reported as such rather than retried or worked around. Per gateway semantics, a 402/403 pauses the chain; no retries, no model switching.

## Explicit non-goals

- No source code edits, no commits, no migrations, no Live/production changes.
- No mocked or deterministic stand-ins; success is claimed only from real persisted provider output.
- No secrets are read, printed, or exposed at any point.
