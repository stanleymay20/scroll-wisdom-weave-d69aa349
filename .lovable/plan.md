# Plan: Reliable build/source identity for Lovable-hosted production builds

## Findings (verified, not guessed)

**What the current code does**
- `scripts/build-commit.mjs` resolves the commit in this order: `GITHUB_SHA` → `VITE_BUILD_ID` → reading the checkout's `.git` → `null` ("unavailable").
- `vite.config.ts` injects the result as `__BUILD_ID__` and writes `dist/release.json` on every build.

**Why production reports `commit: null / commitSource: unavailable`**
- In this sandbox, `.git` exists as a worktree pointer (`gitdir: /nix/store/.../repo.git/worktrees/dev-server`), so the local/preview build resolves a commit from git. That is why preview builds have an identity.
- Lovable's hosted production build runs a plain `vite build` in an environment where, per the evidence (production `/release.json` shows `unavailable`), none of the three sources exist: no `GITHUB_SHA`, no `VITE_BUILD_ID`, and no readable `.git` directory.
- Lovable's official docs confirm there is **no supported platform variable that exposes the source commit SHA to the build**. The only build-time variable mechanisms Lovable documents are:
  1. `VITE_*` variables from committed `.env` files (non-secret, injected by Vite), and
  2. Workspace **build secrets** (Enterprise plan only, intended for things like npm tokens — and they are secrets, so they are the wrong tool for a public commit identity anyway).

**Conclusion:** Lovable does not expose a supported commit-SHA variable to `vite build`. The existing fallback chain is correct; the hosted build environment simply provides none of its inputs.

## Recommended approach (safest supported option)

Since Lovable builds from the Git repository, the only identity guaranteed to be present at build time is **content committed into the repo itself**. Plan:

1. **Add a committed identity file** `public/build-identity.json` (or a `src/` constant) containing the commit SHA, updated automatically on every push to the production branch by a small GitHub Actions workflow (the repo already has CI workflows). The workflow writes the SHA of the commit being built and commits it back (or updates it as part of the release flow).
   - Because the file is in the repo, Lovable's build sees it with zero platform support.
   - `release.json` generation reads this file as a new source (`source: "repo-file"`) before falling back to "unavailable".
2. **Keep the existing fallback chain unchanged** — `GITHUB_SHA` (CI), `VITE_BUILD_ID` (manual override), `.git` (local/preview) all keep working; the repo file is added as an additional, Lovable-compatible source.
3. **Honest fallback preserved:** if none of the sources exist, keep reporting `commit: null / unavailable` rather than guessing — a wrong identity is worse than none.

## Alternative considered and rejected
- **Build secrets (Enterprise):** wrong tool — secrets are for credentials, plan-gated, and would still require manually copying a SHA per deploy.
- **Build timestamp only:** already present (`buildTime`); identifies *when*, not *what* — insufficient as source identity on its own.

## Technical details
- Files touched (after plan approval): `scripts/build-commit.mjs` (add repo-file source + tests in `src/lib/__tests__/buildCommit.test.ts`), new `.github/workflows/` step or script to stamp `public/build-identity.json`, `scripts/create-release-manifest.mjs` (unchanged — it reuses `resolveBuildCommit`).
- No database, publish, or Live changes involved. Publishing remains gated on your explicit authorization.
