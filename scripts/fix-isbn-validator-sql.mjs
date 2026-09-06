import { readFile, writeFile } from "node:fs/promises";

const paths = [
  "supabase/migrations/20260906213000_publishing_identity_and_isbn_registry.sql",
  "supabase/migrations/20260906235000_live_publication_schema_convergence.sql",
];

for (const path of paths) {
  let source = await readFile(path, "utf8");
  const before = source;
  source = source
    .replaceAll("pg_catalog.substring(v FROM 1 FOR 3)", "pg_catalog.substr(v, 1, 3)")
    .replaceAll("pg_catalog.substring(v FROM i FOR 1)", "pg_catalog.substr(v, i, 1)")
    .replaceAll("pg_catalog.substring(v FROM 13 FOR 1)", "pg_catalog.substr(v, 13, 1)");
  if (source === before) throw new Error(`${path}: expected invalid pg_catalog.substring syntax not found`);
  if (source.includes("pg_catalog.substring(v FROM")) throw new Error(`${path}: invalid substring syntax remains`);
  await writeFile(path, source);
}

console.log("ISBN validator SQL repaired in both forward/fresh-install migrations.");