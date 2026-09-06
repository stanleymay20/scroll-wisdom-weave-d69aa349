import { readFile, writeFile } from "node:fs/promises";

const path = "supabase/functions/publish-work/index.ts";
let source = await readFile(path, "utf8");
const needle = '  edition_kind: z.string().default("primary"),\n';
const replacement = '  edition_kind: z.enum(["original", "translation", "revision", "adaptation", "student_edition", "executive_edition", "audiobook_edition", "print_edition"]).default("original"),\n';
const first = source.indexOf(needle);
if (first < 0) throw new Error("edition_kind pattern not found");
if (source.indexOf(needle, first + needle.length) >= 0) throw new Error("edition_kind pattern not unique");
source = source.slice(0, first) + replacement + source.slice(first + needle.length);
await writeFile(path, source);
console.log("publish-work edition contract repaired");
