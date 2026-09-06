import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const migrationDir = path.resolve("supabase/migrations");
const hardenedBaseline = "20260906000000";

const prohibited = [
  ["DROP TABLE", /\bDROP\s+TABLE\b/i],
  ["DROP COLUMN", /\bDROP\s+COLUMN\b/i],
  ["RENAME COLUMN", /\bRENAME\s+COLUMN\b/i],
  ["ALTER COLUMN ... TYPE", /\bALTER\s+COLUMN\b[\s\S]{0,160}?\bTYPE\b/i],
  ["TRUNCATE", /\bTRUNCATE\b/i],
  ["DELETE FROM", /\bDELETE\s+FROM\b/i],
];

const files = (await readdir(migrationDir))
  .filter((file) => /^\d{14}.*\.sql$/i.test(file))
  .filter((file) => file.slice(0, 14) >= hardenedBaseline)
  .sort();

const failures = [];
for (const file of files) {
  const sql = await readFile(path.join(migrationDir, file), "utf8");
  for (const [label, pattern] of prohibited) {
    if (pattern.test(sql)) failures.push(`${file}: ${label}`);
  }
}

if (failures.length > 0) {
  console.error("Unsafe migration operations detected in the hardened migration era:");
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error("Use an additive/backfill-compatible migration or document and isolate the production transition instead.");
  process.exit(1);
}

console.log(`Migration safety gate passed for ${files.length} hardened migration(s).`);
