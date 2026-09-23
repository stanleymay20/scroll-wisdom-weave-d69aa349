import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const functionsRoot = join(root, "supabase/functions");
const functionNames = readdirSync(functionsRoot)
  .filter((name) => name !== "_shared" && statSync(join(functionsRoot, name)).isDirectory())
  .filter((name) => { try { return statSync(join(functionsRoot, name, "index.ts")).isFile(); } catch { return false; } })
  .sort();

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (["node_modules", ".git", "dist", "playwright-report", "test-results"].includes(name)) continue;
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (/\\.(?:ts|tsx|js|mjs|sql|yml|yaml)$/.test(name)) out.push(p);
  }
  return out;
}

const runtimeRoots = ["src", "supabase/functions", "supabase/migrations", ".github"].map((p) => join(root, p));
const files = runtimeRoots.flatMap((p) => walk(p));
const externalEntrypoints = new Set(["stripe-webhook", "gumroad-oauth-callback", "shopify-oauth-callback"]);
const failures = [];
const reachable = [];

for (const fn of functionNames) {
  if (externalEntrypoints.has(fn)) { reachable.push({ fn, via: "external entrypoint" }); continue; }
  const ownPrefix = join(functionsRoot, fn) + "/";
  const patterns = [
    "functions.invoke(\\\"" + fn + "\\\"",
    "functions.invoke(\\\'" + fn + "\\'",
    "/functions/v1/" + fn,
    "functions/v1/" + fn,
    "\\\"" + fn + "\\\"",
    "\\'" + fn + "\\'",
  ];
  let found = null;
  for (const file of files) {
    if (file.startsWith(ownPrefix)) continue;
    const body = readFileSync(file, "utf8");
    if (patterns.some((p) => body.includes(p))) { found = relative(root, file); break; }
  }
  if (!found) failures.push(fn);
  else reachable.push({ fn, via: found });
}

console.log("Audited reachability for " + functionNames.length + " Edge Functions.");
for (const row of reachable) console.log("  PASS " + row.fn + ": " + row.via);
if (failures.length) {
  console.error("\\nPotential orphan Edge Functions (no runtime caller or external-entry classification found):");
  for (const fn of failures) console.error("  - " + fn);
  console.error("\\nWire the function, delete dead code, or explicitly classify a real external trigger.");
  process.exit(1);
}
