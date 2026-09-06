import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const excluded = /^(bun\.lock|docs\/SECURITY\.md|scripts\/check-secrets\.mjs)$/;
const patterns = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["Supabase service-role JWT", /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]*InJvbGUiOiJzZXJ2aWNlX3JvbGUi[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+/],
  ["Stripe live secret", /sk_live_[A-Za-z0-9]{20,}/],
  ["GitHub token", /github_pat_[A-Za-z0-9_]{30,}/],
];
const findings = [];
for (const file of files) {
  if (excluded.test(file)) continue;
  let body;
  try { body = await readFile(file, "utf8"); } catch { continue; }
  for (const [label, pattern] of patterns) if (pattern.test(body)) findings.push(`${file}: ${label}`);
}
if (findings.length) {
  console.error(`Potential committed secrets found:\n${findings.map((item) => `- ${item}`).join("\n")}`);
  process.exit(1);
}
console.log(`Secret-pattern scan passed across ${files.length} tracked files.`);
