# Runtime/Environment Inspection Report (no changes made)

## What VITE_SUPABASE_URL resolves to (preview app)
- `VITE_SUPABASE_URL` = `https://dxourcpvgfampcquzaqw.supabase.co`
- `VITE_SUPABASE_PROJECT_ID` = `dxourcpvgfampcquzaqw`
- The publishable key's embedded `ref` claim matches the same project.

## Is that the same database exposed by Lovable Cloud tooling?
Yes. The Lovable Cloud project info reports the same project (`dxourcpvgfampcquzaqw`, same URL) as the **Test (dev)** instance, and the session query tools are bound to that same Test database. The preview app and the Lovable Cloud query tools therefore read/write the same database.

- Live (production) instance is a separate database: ref `lrricdforqfkaaciammv`. The published app uses Live.
- Note: migration drift between Test and Live could not be compared (tool reported it could not compare).

## Is the external Supabase connector the active backend?
No. Project info reports "Managed by Lovable: true" — the active backend is **Lovable Cloud**, not an externally connected Supabase account.

## Other observations
- Backend pause status: `Paused: false` (currently running).
- Instance size: Tiny.

## Actions
None. This was read-only inspection; no files were edited and no state-changing commands were run.
