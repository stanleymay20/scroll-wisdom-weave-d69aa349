export type BuildCommitSource = "RELEASE_COMMIT_SHA" | "GITHUB_SHA" | "VITE_BUILD_ID" | "git" | "unavailable";

export function commitFromGitDirectory(root?: string): string | null;

export function resolveBuildCommit(
  env?: Record<string, string | undefined>,
  root?: string,
): { commit: string | null; source: BuildCommitSource };

export function requireReleaseCommit(
  env?: Record<string, string | undefined>,
  root?: string,
): { commit: string; source: BuildCommitSource };
