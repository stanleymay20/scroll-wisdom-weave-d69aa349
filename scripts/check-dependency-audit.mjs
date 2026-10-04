import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const policy = JSON.parse(await readFile(new URL("../security/audit-exceptions.json", import.meta.url), "utf8"));
const expiry = new Date(`${policy.expires}T23:59:59Z`);
if (!Number.isFinite(expiry.valueOf()) || Date.now() > expiry.valueOf()) {
  console.error(`Dependency-audit exceptions expired on ${policy.expires}; review and remove or explicitly renew them.`);
  process.exit(1);
}

const stripAnsi = (value) => value.replace(/\x1B\[[0-?]*[ -\/]*[@-~]/g, "");

// Keep the reviewed backlog visible in CI instead of letting --ignore hide the
// package/advisory paths that must be remediated before the exception expiry.
const backlog = spawnSync("bun", ["audit", "--prod", "--audit-level=high"], {
  encoding: "utf8",
  stdio: ["inherit", "pipe", "pipe"],
});
const backlogText = stripAnsi(`${backlog.stdout ?? ""}\n${backlog.stderr ?? ""}`);
console.log("--- reviewed high/critical dependency backlog (informational) ---");
if (backlog.stdout) process.stdout.write(backlog.stdout);
if (backlog.stderr) process.stderr.write(backlog.stderr);
console.log("--- end reviewed dependency backlog ---");

// Fail closed on drift in the raw production audit *before* applying Bun's
// global advisory ignores. This prevents a reviewed GHSA from silently masking
// the same vulnerable package when a second production parent appears.
const foundAdvisories = new Set(
  [...backlogText.matchAll(/https:\/\/github\.com\/advisories\/(GHSA-[A-Za-z0-9-]+)/g)].map((match) => match[1]),
);
const expectedAdvisories = new Set(policy.advisories);
const missingAdvisories = [...expectedAdvisories].filter((id) => !foundAdvisories.has(id));
const unexpectedAdvisories = [...foundAdvisories].filter((id) => !expectedAdvisories.has(id));
if (missingAdvisories.length > 0 || unexpectedAdvisories.length > 0) {
  console.error(
    `Raw production audit no longer matches the reviewed advisory set. Missing: ${missingAdvisories.join(", ") || "none"}; ` +
      `unexpected: ${unexpectedAdvisories.join(", ") || "none"}.`,
  );
  process.exit(1);
}

const expectedPaths = new Set(policy.expectedProductionPaths ?? []);
if (expectedPaths.size > 0) {
  const foundPaths = new Set(
    backlogText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.includes("›")),
  );
  const missingPaths = [...expectedPaths].filter((path) => !foundPaths.has(path));
  const unexpectedPaths = [...foundPaths].filter((path) => !expectedPaths.has(path));
  if (missingPaths.length > 0 || unexpectedPaths.length > 0) {
    console.error(
      `Reviewed production dependency path changed. Missing: ${missingPaths.join(", ") || "none"}; ` +
        `unexpected: ${unexpectedPaths.join(", ") || "none"}.`,
    );
    process.exit(1);
  }
}

// The second audit remains the final fail-closed gate for any new high/critical
// advisory outside the reviewed baseline.
const args = ["audit", "--prod", "--audit-level=high", ...policy.advisories.flatMap((id) => ["--ignore", id])];
const result = spawnSync("bun", args, { encoding: "utf8", stdio: ["inherit", "pipe", "pipe"] });
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.status !== 0) {
  console.error("Dependency audit found a new high/critical advisory outside the time-bounded reviewed baseline.");
  process.exit(result.status ?? 1);
}
console.log(
  `Dependency audit passed; ${policy.advisories.length} reviewed exceptions on ${expectedPaths.size || "unconstrained"} ` +
    `production path(s) expire ${policy.expires}.`,
);
