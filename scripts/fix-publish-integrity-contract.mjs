import { readFile, writeFile } from "node:fs/promises";

const path = "supabase/functions/publish-work/index.ts";
let source = await readFile(path, "utf8");

function replaceOnce(needle, replacement, label) {
  const i = source.indexOf(needle);
  if (i < 0) throw new Error(`${label}: pattern not found`);
  if (source.indexOf(needle, i + needle.length) >= 0) throw new Error(`${label}: pattern not unique`);
  source = source.slice(0, i) + replacement + source.slice(i + needle.length);
}

replaceOnce(
  '  integrity_level: z.enum(["draft", "standard", "verified", "certified"]).default("standard"),\n',
  '',
  'remove caller-controlled integrity level',
);
replaceOnce(
  'type PublicationGate = "structural" | "rights" | "production";\n',
  'type PublicationGate = "structural" | "rights" | "production";\nconst PUBLISHED_INTEGRITY = "verified_published" as const;\n',
  'add server-owned published integrity',
);
source = source.replaceAll('integrity_level: body.integrity_level', 'integrity_level: PUBLISHED_INTEGRITY');
if (source.includes('body.integrity_level')) throw new Error('caller integrity reference remains');

await writeFile(path, source);
console.log('publish-work integrity contract repaired');
