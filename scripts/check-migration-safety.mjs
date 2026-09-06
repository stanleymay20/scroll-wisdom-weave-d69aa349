import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const migrationDir = path.resolve("supabase/migrations");
const hardenedBaseline = "20260906000000";

const prohibited = [
  ["DROP TABLE", /\bDROP\s+TABLE\b/i],
  ["DROP COLUMN", /\bDROP\s+COLUMN\b/i],
  ["RENAME COLUMN", /\bRENAME\s+COLUMN\b/i],
  ["ALTER COLUMN ... TYPE", /\bALTER\s+COLUMN\b[\s\S]{0,160}?\bTYPE\b/i],
  // Match actual TRUNCATE statements, not privilege revocations such as
  // "REVOKE ... TRUNCATE ..." used to harden browser roles.
  ["TRUNCATE", /(?:^|;)\s*TRUNCATE\b/im],
  ["DELETE FROM", /\bDELETE\s+FROM\b/i],
];

const allFiles = (await readdir(migrationDir))
  .filter((file) => /^\d{14}.*\.sql$/i.test(file))
  .sort();

const hardenedFiles = allFiles.filter((file) => file.slice(0, 14) >= hardenedBaseline);
const failures = [];

// The legacy archive predates the hardened migration policy and is explicitly
// treated as history that must be baselined, not replayed blindly. Enforce
// unique migration versions for all new/hardened migrations going forward.
const byVersion = new Map();
for (const file of hardenedFiles) {
  const version = file.slice(0, 14);
  const existing = byVersion.get(version) || [];
  existing.push(file);
  byVersion.set(version, existing);
}

for (const [version, versionFiles] of byVersion) {
  if (versionFiles.length > 1) {
    failures.push(`duplicate hardened migration version ${version}: ${versionFiles.join(", ")}`);
  }
}

for (const file of hardenedFiles) {
  const sql = await readFile(path.join(migrationDir, file), "utf8");
  for (const [label, pattern] of prohibited) {
    if (pattern.test(sql)) failures.push(`${file}: ${label}`);
  }
}

if (failures.length > 0) {
  console.error("Migration safety gate failed:");
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error("Use unique migration versions and additive/backfill-compatible schema changes.");
  process.exit(1);
}

console.log(
  `Migration safety gate passed: ${hardenedFiles.length} hardened migration(s) ` +
  `have unique versions and no prohibited destructive SQL.`,
);
