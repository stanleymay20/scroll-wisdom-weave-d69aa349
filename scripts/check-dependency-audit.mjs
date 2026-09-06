import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const policy = JSON.parse(await readFile(new URL("../security/audit-exceptions.json", import.meta.url), "utf8"));
const expiry = new Date(`${policy.expires}T23:59:59Z`);
if (!Number.isFinite(expiry.valueOf()) || Date.now() > expiry.valueOf()) {
  console.error(`Dependency-audit exceptions expired on ${policy.expires}; review and remove or explicitly renew them.`);
  process.exit(1);
}

const args = ["audit", "--prod", "--audit-level=high", ...policy.advisories.flatMap((id) => ["--ignore", id])];
const result = spawnSync("bun", args, { encoding: "utf8", stdio: ["inherit", "pipe", "pipe"] });
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.status !== 0) {
  console.error("Dependency audit found a new high/critical advisory outside the time-bounded reviewed baseline.");
  process.exit(result.status ?? 1);
}
console.log(`Dependency audit passed; ${policy.advisories.length} reviewed exceptions expire ${policy.expires}.`);
