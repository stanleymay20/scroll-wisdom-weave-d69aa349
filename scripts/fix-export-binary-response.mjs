import { readFile, writeFile } from "node:fs/promises";

const path = "supabase/functions/export-book/index.ts";
const before = await readFile(path, "utf8");
const needle = `      return new Response(renderedBytes, {`;
const replacement = `      const directBinaryBody = new Uint8Array(renderedBytes).buffer;\n      return new Response(directBinaryBody, {`;
const first = before.indexOf(needle);
if (first < 0) throw new Error("Expected direct binary Response source pattern not found");
if (before.indexOf(needle, first + needle.length) >= 0) throw new Error("Expected exactly one direct binary Response source pattern");
const after = before.slice(0, first) + replacement + before.slice(first + needle.length);
await writeFile(path, after);
console.log("Binary export Response body repair applied.");
