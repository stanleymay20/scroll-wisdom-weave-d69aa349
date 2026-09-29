import { readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Which commit is this build made from?
 *
 * CI states it (GITHUB_SHA). Lovable's hosting rebuilds from the repository
 * with a plain `vite build` and states nothing, which left production unable
 * to say what it was running: /release.json did not exist there, and Sentry
 * releases were named after the build time.
 *
 * So after the explicit variables, this reads the checkout's own .git
 * directory. It reads files rather than running `git`, because a build image
 * can carry the repository without the binary. When neither is available it
 * says so — a null commit is honest; a guessed one is worse than none.
 */

const SHA = /^[0-9a-f]{40}$/;

function readText(file) {
  try {
    return readFileSync(file, "utf8").trim();
  } catch {
    return null;
  }
}

/** The .git directory, following the `gitdir:` pointer a worktree leaves. */
function gitDirectory(root) {
  const dotGit = path.join(root, ".git");
  try {
    if (statSync(dotGit).isDirectory()) return dotGit;
  } catch {
    return null;
  }
  const pointer = readText(dotGit);
  const match = pointer?.match(/^gitdir:\s*(.+)$/m);
  return match ? path.resolve(root, match[1].trim()) : null;
}

function refFromPackedRefs(gitDir, ref) {
  const packed = readText(path.join(gitDir, "packed-refs"));
  if (!packed) return null;
  for (const line of packed.split("\n")) {
    const [sha, name] = line.trim().split(/\s+/);
    if (name === ref && SHA.test(sha ?? "")) return sha;
  }
  return null;
}

export function commitFromGitDirectory(root = process.cwd()) {
  const gitDir = gitDirectory(root);
  if (!gitDir) return null;

  const head = readText(path.join(gitDir, "HEAD"));
  if (!head) return null;
  // A detached checkout, which is how most CI and build systems check out.
  if (SHA.test(head)) return head;

  const ref = head.match(/^ref:\s*(.+)$/)?.[1]?.trim();
  if (!ref) return null;

  // Worktrees keep refs in the common directory, not their own.
  const common = readText(path.join(gitDir, "commondir"));
  const refDirs = common ? [gitDir, path.resolve(gitDir, common)] : [gitDir];
  for (const dir of refDirs) {
    const loose = readText(path.join(dir, ref));
    if (loose && SHA.test(loose)) return loose;
    const packed = refFromPackedRefs(dir, ref);
    if (packed) return packed;
  }
  return null;
}

/**
 * @returns {{ commit: string | null, source: "RELEASE_COMMIT_SHA" | "GITHUB_SHA" | "VITE_BUILD_ID" | "git" | "unavailable" }}
 */
export function resolveBuildCommit(env = process.env, root = process.cwd()) {
  const release = env.RELEASE_COMMIT_SHA?.trim().toLowerCase();
  if (release && SHA.test(release)) return { commit: release, source: "RELEASE_COMMIT_SHA" };

  const fromCi = env.GITHUB_SHA?.trim().toLowerCase();
  if (fromCi && SHA.test(fromCi)) return { commit: fromCi, source: "GITHUB_SHA" };

  // VITE_BUILD_ID predates this file and may hold any label, not only a SHA.
  const declared = env.VITE_BUILD_ID?.trim();
  if (declared && SHA.test(declared.toLowerCase())) return { commit: declared.toLowerCase(), source: "VITE_BUILD_ID" };

  const fromGit = commitFromGitDirectory(root);
  if (fromGit) return { commit: fromGit, source: "git" };

  return { commit: null, source: "unavailable" };
}

/** Production identity must name the checked-out commit, never an arbitrary label. */
export function requireReleaseCommit(env = process.env, root = process.cwd()) {
  const identity = resolveBuildCommit(env, root);
  if (!identity.commit || !SHA.test(identity.commit)) {
    throw new Error("Production build requires an exact 40-character commit SHA. Supply GITHUB_SHA or VITE_BUILD_ID from the trusted checkout.");
  }
  const checkout = commitFromGitDirectory(root);
  if (checkout && identity.commit !== checkout) {
    throw new Error("Declared release SHA does not match the checked-out commit.");
  }
  return identity;
}
