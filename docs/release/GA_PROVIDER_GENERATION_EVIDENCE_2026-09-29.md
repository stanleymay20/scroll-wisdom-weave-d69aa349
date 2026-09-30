# GA provider-backed generation evidence — 2026-09-29

## Scope

This record closes release-matrix journey P04 for the conservative GA launch scope:
standard text generation → persisted book/chapters → library ownership → full generated chapter.

The smoke was executed against the ScrollLibrary **Test** backend only. It did not
modify Live/production, deploy code, expose provider credentials, or rely on a
mock/deterministic AI response.

## Execution evidence

- A disposable authenticated Test user was created and signed in through the real Supabase auth boundary.
- `generate-book` was invoked through the deployed Test Edge Function with the disposable user's real JWT.
- The function returned **HTTP 200** and a real provider-generated outline.
- Generated book id prefix: `5b1f1fe6…`.
- The book persisted with the disposable user as the authoritative owner and creator.
- A corresponding `user_library` row persisted.
- `generate-chapter` was then invoked through the real deployed Edge Function for chapter 1.
- Generated chapter id prefix: `693e55c4…`.
- The provider response reported `success: true`, provider **Lovable AI**, and **2,496 words**.
- The persisted chapter contained **18,561 characters**, was marked `is_generated = true`,
  and contained genuine prose rather than a placeholder/health-check fixture.
- The generated chapter passed the content-quality contract with zero reported violations.
- No provider 402, 403, or 429 occurred.

## Cleanup evidence

After verification, the disposable fixture was removed. Final Test-backend checks showed:

- 0 fixture books
- 0 fixture chapters
- 0 fixture library rows
- 0 fixture profiles
- 0 disposable auth users

Local files containing the disposable session token were also deleted.

## Release interpretation

P04 is **PASS** for the GA standard-text generation journey.

This evidence does **not** promote advanced/provider-dependent features that remain
outside GA scope, including research mode, advanced regeneration, generated covers,
media, or other feature-gated provider journeys.
