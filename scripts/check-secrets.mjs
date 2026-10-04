import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const excluded = /^(bun\.lock|docs\/SECURITY\.md|scripts\/check-secrets\.mjs)$/;

const githubAppInstallationTokenPattern = /ghs_[A-Za-z0-9.\-_]{36,}/;

const patterns = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["Supabase service-role JWT", /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]*InJvbGUiOiJzZXJ2aWNlX3JvbGUi[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+/],
  ["Stripe live secret", /sk_live_[A-Za-z0-9]{20,}/],
  ["GitHub personal access token", /github_pat_[A-Za-z0-9_]{30,}/],
  ["GitHub App installation token", githubAppInstallationTokenPattern],
];

// GitHub's 2026 stateless installation-token rollout keeps the ghs_ prefix,
// but the token can now be a ~520-character JWT containing two dots. Keep a
// tiny fail-closed self-test here so future pattern edits cannot silently lose
// either the classic opaque form or the new JWT form.
const classicInstallationTokenFixture = `ghs_${"A".repeat(36)}`;
const statelessInstallationTokenFixture =
  `ghs_app_123_${"a".repeat(160)}.${"b".repeat(160)}.${"c".repeat(160)}`;
if (
  !githubAppInstallationTokenPattern.test(classicInstallationTokenFixture) ||
  !githubAppInstallationTokenPattern.test(statelessInstallationTokenFixture) ||
  githubAppInstallationTokenPattern.test("ghs_too_short")
) {
  throw new Error("GitHub App installation-token detector no longer covers both supported token formats.");
}

const findings = [];
for (const file of files) {
  if (excluded.test(file)) continue;
  let body;
  try {
    body = await readFile(file, "utf8");
  } catch {
    continue;
  }
  for (const [label, pattern] of patterns) {
    if (pattern.test(body)) findings.push(`${file}: ${label}`);
  }
}
if (findings.length) {
  console.error(`Potential committed secrets found:\n${findings.map((item) => `- ${item}`).join("\n")}`);
  process.exit(1);
}
console.log(`Secret-pattern scan passed across ${files.length} tracked files.`);
