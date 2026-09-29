import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { commitFromGitDirectory, resolveBuildCommit, requireReleaseCommit } from "../../../scripts/build-commit.mjs";

const A = "a".repeat(40);
const B = "b".repeat(40);
const dirs: string[] = [];

function repo(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), "build-commit-"));
  dirs.push(root);
  for (const [name, body] of Object.entries(files)) {
    const target = path.join(root, name);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, body);
  }
  return root;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("commitFromGitDirectory", () => {
  it("follows HEAD to a loose branch ref", () => {
    const root = repo({ ".git/HEAD": "ref: refs/heads/main\n", ".git/refs/heads/main": `${A}\n` });
    expect(commitFromGitDirectory(root)).toBe(A);
  });

  it("finds a branch that exists only in packed-refs", () => {
    const root = repo({
      ".git/HEAD": "ref: refs/heads/main\n",
      ".git/packed-refs": `# pack-refs with: peeled fully-peeled sorted\n${B} refs/heads/other\n${A} refs/heads/main\n`,
    });
    expect(commitFromGitDirectory(root)).toBe(A);
  });

  it("reads a detached HEAD, which is how build systems usually check out", () => {
    const root = repo({ ".git/HEAD": `${B}\n` });
    expect(commitFromGitDirectory(root)).toBe(B);
  });

  it("follows a worktree's gitdir pointer and its commondir for refs", () => {
    const root = repo({
      "main/.git/refs/heads/feature": `${A}\n`,
      "main/.git/worktrees/wt/HEAD": "ref: refs/heads/feature\n",
      "main/.git/worktrees/wt/commondir": "../..\n",
      "wt/.git": "gitdir: ../main/.git/worktrees/wt\n",
    });
    expect(commitFromGitDirectory(path.join(root, "wt"))).toBe(A);
  });

  it("returns null rather than guessing when there is no repository", () => {
    expect(commitFromGitDirectory(repo({ "README.md": "no git here" }))).toBeNull();
  });

  it("returns null for a branch with no commits yet", () => {
    expect(commitFromGitDirectory(repo({ ".git/HEAD": "ref: refs/heads/main\n" }))).toBeNull();
  });
});

describe("resolveBuildCommit", () => {
  const withGit = () => repo({ ".git/HEAD": `${B}\n` });

  it("prefers CI's GITHUB_SHA and normalises its case", () => {
    expect(resolveBuildCommit({ GITHUB_SHA: A.toUpperCase() }, withGit())).toEqual({ commit: A, source: "GITHUB_SHA" });
  });

  it("ignores a GITHUB_SHA that is not a SHA", () => {
    expect(resolveBuildCommit({ GITHUB_SHA: "main" }, withGit())).toEqual({ commit: B, source: "git" });
  });

  it("ignores a non-SHA VITE_BUILD_ID", () => {
    expect(resolveBuildCommit({ VITE_BUILD_ID: "release-42" }, withGit())).toEqual({ commit: B, source: "git" });
  });

  it("refuses unidentified production builds", () => {
    expect(() => requireReleaseCommit({}, repo({}))).toThrow(/exact 40-character/);
  });

  it("refuses a declared SHA that disagrees with the checkout", () => {
    expect(() => requireReleaseCommit({ GITHUB_SHA: A }, withGit())).toThrow(/does not match/);
  });

  it("accepts the exact checkout SHA", () => {
    expect(requireReleaseCommit({ GITHUB_SHA: B }, withGit()).commit).toBe(B);
  });

  it("falls back to the checkout when nothing is declared — the hosted-build case", () => {
    expect(resolveBuildCommit({}, withGit())).toEqual({ commit: B, source: "git" });
  });

  it("says unavailable instead of inventing an identity", () => {
    expect(resolveBuildCommit({}, repo({}))).toEqual({ commit: null, source: "unavailable" });
  });
});
