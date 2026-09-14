// Rate-limit durability gate.
//
// _shared/http.ts exports two limiters. enforceRateLimit counts in a
// process-local Map: it resets on every cold start and is not shared between
// edge instances, so on its own it enforces nothing — a caller simply waits for
// a new instance, and a scaled-out pool never reaches the cap at all.
// enforceDurableRateLimit counts in PostgreSQL under an advisory lock and holds
// across instances.
//
// Every endpoint whose limit is the actual spend or abuse control must use the
// durable one. The only sanctioned exceptions are the anonymous ingestion
// endpoints below, where the in-memory limiter is a free first pass in front of
// an enforcePersistentVelocity gate at the same cap — that gate is the durable
// control, and adding enforceDurableRateLimit there would buy a second database
// round trip for a limit already enforced. This gate checks that claim rather
// than trusting it: an exempt endpoint must actually call
// enforcePersistentVelocity.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const functionsDir = path.resolve("supabase/functions");

/** Endpoints allowed to call enforceRateLimit, each backed by a velocity gate. */
const IN_MEMORY_ALLOWED = new Set([
  "log-search-query",
  "log-storefront-event",
  "log-recommendation-feedback",
]);

const entries = await readdir(functionsDir, { withFileTypes: true });
const failures = [];
const exemptSeen = new Set();

for (const entry of entries.filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
  const name = entry.name;
  if (name.startsWith("_")) continue;

  let source;
  try {
    source = await readFile(path.join(functionsDir, name, "index.ts"), "utf8");
  } catch {
    continue; // no entrypoint (shared helpers, fixtures)
  }

  // \b would also match inside enforceDurableRateLimit, which ends in the same
  // letters; require the identifier to start at a non-identifier character.
  if (!/(?<![A-Za-z0-9_$])enforceRateLimit\s*[({]/.test(source)) continue;

  if (!IN_MEMORY_ALLOWED.has(name)) {
    failures.push(
      `${name}: uses the in-memory enforceRateLimit. Its cap resets on every ` +
        `cold start and is per instance. Use enforceDurableRateLimit(admin, ...).`,
    );
    continue;
  }

  exemptSeen.add(name);
  if (!source.includes("enforcePersistentVelocity")) {
    failures.push(
      `${name}: exempt from the durable limiter only because it was backed by ` +
        `enforcePersistentVelocity, and that call is gone. Restore it, or move ` +
        `this endpoint to enforceDurableRateLimit and drop the exemption.`,
    );
  }
}

// A stale exemption is a silent hole: the next endpoint to take that name
// inherits a pass it never earned.
for (const name of [...IN_MEMORY_ALLOWED].sort()) {
  if (!exemptSeen.has(name)) {
    failures.push(
      `${name}: listed as an in-memory limiter exemption but no longer uses ` +
        `enforceRateLimit. Remove it from IN_MEMORY_ALLOWED.`,
    );
  }
}

if (failures.length > 0) {
  console.error("Rate-limit durability gate failed:\n");
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error(
    "\nSee supabase/functions/_shared/http.ts for the difference between the " +
      "two limiters.",
  );
  process.exit(1);
}

console.log(
  `Rate-limit durability gate passed: every metered endpoint uses the durable ` +
    `limiter, and ${exemptSeen.size} anonymous ingestion endpoint(s) remain ` +
    `backed by enforcePersistentVelocity.`,
);
