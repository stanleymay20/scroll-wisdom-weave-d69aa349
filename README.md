# Scroll Wisdom Weave / ScrollLibrary

A React + TypeScript reading, learning, publishing, and creator platform backed by Supabase.

## Requirements

- Bun 1.2.23
- A Supabase project

## Local setup

```bash
cp .env.example .env
bun install --frozen-lockfile
bun run dev
```

Fill `.env` with the client-side Supabase project URL and publishable/anon key. Never place a service-role or other server secret in a `VITE_` variable.

## Quality gates

Run the same checks enforced on `main`:

```bash
bun run typecheck
bun run lint
bun run test
bun run build
```

Or run them sequentially with:

```bash
bun run ci
```

CI installs dependencies from `bun.lock` with `--frozen-lockfile` so dependency resolution is reproducible.

## Supabase

- Migrations and Edge Functions live under `supabase/`.
- `supabase/config.toml` is local/function configuration; production deployment should select its target project explicitly.
- Functions with `verify_jwt = false` must authenticate the caller, verify a provider signature, or be intentionally public.
- Local CLI state under `supabase/.temp/` and `supabase/.branches/` is ignored.

## Security expectations

- Local `.env` files are ignored. Commit only `.env.example`.
- Render user-controlled text through React or sanitize it explicitly; do not inject unsanitized HTML.
- Restrict external URLs derived from user/API data to safe protocols.
- Never expose service-role or secret keys in browser code.
