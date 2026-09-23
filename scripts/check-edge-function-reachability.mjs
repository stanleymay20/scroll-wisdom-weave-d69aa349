import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const functionsRoot = join(root, "supabase/functions");

const functionNames = readdirSync(functionsRoot)
  .filter(
    (name) =>
      name !== "_shared" &&
      statSync(join(functionsRoot, name)).isDirectory(),
  )
  .filter((name) => {
    try {
      return statSync(join(functionsRoot, name, "index.ts")).isFile();
    } catch {
      return false;
    }
  })
  .sort();

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (
      ["node_modules", ".git", "dist", "playwright-report", "test-results"].includes(
        name,
      )
    ) {
      continue;
    }

    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      walk(path, out);
    } else if (
      /\.(?:ts|tsx|js|mjs|yml|yaml)$/.test(name) &&
      !/(?:_test|\.test|\.spec)\.(?:ts|tsx|js|mjs)$/.test(name)
    ) {
      out.push(path);
    }
  }
  return out;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const runtimeRoots = [
  "src",
  "supabase/functions",
  ".github",
].map((path) => join(root, path));
const files = runtimeRoots.flatMap((path) => walk(path));

// These are entered by a trusted external system or intentionally public
// network route rather than by another application module. Every entry needs
// a concrete operational reason; do not use this map as a junk drawer.
const externalEntrypoints = new Map([
  ["stripe-webhook", "Stripe signed webhook"],
  ["gumroad-oauth-callback", "Gumroad OAuth callback"],
  ["shopify-oauth-callback", "Shopify OAuth callback"],
  ["materialize-release-schedules", "scheduler/operational fallback endpoint"],
  ["resolve-scroll-id", "public ScrollLibrary identifier-resolution API"],
]);

const failures = [];
const reachable = [];

for (const fn of functionNames) {
  const externalReason = externalEntrypoints.get(fn);
  if (externalReason) {
    reachable.push({ fn, via: externalReason });
    continue;
  }

  const ownPrefix = join(functionsRoot, fn) + "/";
  const escaped = escapeRegex(fn);
  const invokePattern = new RegExp(
    "functions\\.invoke\\s*\\(\\s*[\\\"'\x60]" +
      escaped +
      "[\\\"'\x60]",
  );
  const directHttpPatterns = ["/functions/v1/" + fn, "functions/v1/" + fn];

  // Recognized application wrappers. A bare quoted slug does NOT count as
  // reachability: registries, labels and dead feature flags must not make an
  // orphaned function look wired.
  const wrapperPattern = new RegExp(
    "(?:invokeFunction|invokePublishFunction|invokeEdgeFunction)" +
      "\\s*\\(\\s*[\\\"'\\x60]" +
      escaped +
      "[\\\"'\\x60]",
  );

  let found = null;
  for (const file of files) {
    if (file.startsWith(ownPrefix)) continue;
    const body = readFileSync(file, "utf8");
    if (
      invokePattern.test(body) ||
      wrapperPattern.test(body) ||
      directHttpPatterns.some((pattern) => body.includes(pattern))
    ) {
      found = relative(root, file);
      break;
    }
  }

  if (!found) failures.push(fn);
  else reachable.push({ fn, via: found });
}

console.log(
  "Audited runtime reachability for " +
    functionNames.length +
    " Edge Functions.",
);
for (const row of reachable) console.log("  PASS " + row.fn + ": " + row.via);

if (failures.length) {
  console.error(
    "\nPotential orphan Edge Functions (no runtime caller or external-entry classification found):",
  );
  for (const fn of failures) console.error("  - " + fn);
  console.error(
    "\nWire the function, delete dead code, or explicitly classify a real external trigger.",
  );
  process.exit(1);
}
