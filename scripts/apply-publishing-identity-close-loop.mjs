import { readFile, writeFile } from "node:fs/promises";

async function patch(path, mutate) {
  const before = await readFile(path, "utf8");
  const after = mutate(before);
  if (after === before) throw new Error(`${path}: patch produced no change`);
  await writeFile(path, after);
}

function replaceOnce(source, needle, replacement, label) {
  const first = source.indexOf(needle);
  if (first < 0) throw new Error(`${label}: expected source pattern not found`);
  if (source.indexOf(needle, first + needle.length) >= 0) throw new Error(`${label}: expected exactly one source pattern`);
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
}

await patch("supabase/functions/_shared/epub-builder.ts", (source) => replaceOnce(
  source,
  'import type JSZip from "https://esm.sh/jszip@3.10.1";',
  'import type JSZip from "npm:jszip@3.10.1";',
  "EPUB JSZip Deno import",
));

await patch("supabase/functions/enqueue-export-bundle/index.ts", (source) => {
  source = replaceOnce(
    source,
    'import JSZip from "https://esm.sh/jszip@3.10.1";',
    'import JSZip from "npm:jszip@3.10.1";',
    "bundle JSZip Deno import",
  );
  source = replaceOnce(
    source,
    "    const canonical = parseBookToCanonical(chapterList);",
    "    const canonical = parseBookToCanonical(chapterList.map((chapter) => ({ ...chapter, title: chapter.title ?? \"\" })));",
    "bundle canonical nullable chapter title",
  );
  return source;
});

await patch("supabase/functions/_shared/publishingIdentity.ts", (source) => {
  source = replaceOnce(
    source,
    'import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";\n',
    'type PublishingIdentityDb = { from: (table: string) => any };\n',
    "publishing identity DB client type",
  );
  source = replaceOnce(
    source,
    "  sc: SupabaseClient,",
    "  sc: PublishingIdentityDb,",
    "publishing identity resolver client parameter",
  );
  return source;
});

await patch("supabase/functions/export-book/index.ts", (source) => {
  source = replaceOnce(
    source,
    'import { isbnForPublicationSnapshot, publisherFromPublicationSnapshot } from "../_shared/isbn.ts";\n',
    'import { isbnForPublicationSnapshot, publisherFromPublicationSnapshot } from "../_shared/isbn.ts";\nimport { resolvePrepublicationIdentity } from "../_shared/publishingIdentity.ts";\n',
    "export prepublication identity import",
  );
  source = replaceOnce(
    source,
    `    }\n\n    // Fallbacks when no published snapshot exists yet (draft export).`,
    `    }\n\n    // Before an immutable Publication exists, production certification must\n    // render the exact publisher/imprint + format-specific ISBN configuration\n    // that is already part of the bound publication hash. Otherwise a PDF could\n    // pass certification and later gain different publication identity metadata.\n    if (!canonicalPublicationId) {\n      const prepublicationIdentity = await resolvePrepublicationIdentity(supabase, bookId, format);\n      if (prepublicationIdentity.configured) {\n        canonicalPublisher = prepublicationIdentity.publisherName;\n        canonicalImprint = prepublicationIdentity.publisherImprint;\n        canonicalIsbn = prepublicationIdentity.isbnForExport;\n        canonicalLanguage = prepublicationIdentity.language;\n      }\n    }\n\n    // Fallbacks when no published snapshot exists yet (draft export).`,
    "export prepublication identity resolution",
  );
  return source;
});

await patch("src/lib/__tests__/bundleContent.test.ts", (source) => {
  source = replaceOnce(
    source,
    '  contentHash: "deadbeef".repeat(8),\n  ...overrides,',
    '  contentHash: "deadbeef".repeat(8),\n  extras: {\n    publisherName: "ScrollLibrary Publishing",\n    publisherImprint: "ScrollLibrary Press",\n    isbn: "9780306406157",\n    isbnByFormat: { paperback: "9780306406157" },\n    identifierStrategy: "platform_isbn",\n    distributionScope: "global",\n  },\n  ...overrides,',
    "bundle test canonical publisher fixture",
  );
  source = replaceOnce(
    source,
    '    expect(md).toContain("Published via ScrollLibrary");',
    '    expect(md).toContain("Published by ScrollLibrary Press.");\n    expect(md).toContain("ISBN: 9780306406157");',
    "bundle front matter publisher assertion",
  );
  source = replaceOnce(
    source,
    '  it("omits the author section when there is no bio", () => {',
    '  it("never claims ScrollLibrary as publisher when no canonical publisher is present", () => {\n    const ctx = baseCtx({ extras: null });\n    const md = renderFrontMatter(ctx);\n    expect(md).toContain("Published by Independent publisher.");\n    expect(md).not.toContain("ScrollLibrary Press");\n  });\n\n  it("omits the author section when there is no bio", () => {',
    "bundle independent publisher safety test",
  );
  return source;
});

await patch("src/components/publish/PublishingIdentityPanel.tsx", (source) => {
  source = replaceOnce(
    source,
    '<h2 className="text-lg font-semibold">Publisher & ISBN identity</h2>',
    '<h2 className="text-lg font-semibold">Publishing Identity</h2>',
    "publishing identity panel title",
  );
  source = replaceOnce(
    source,
    '            This identity is frozen into the publication record and reused by PDF, EPUB and distribution bundles. ScrollLibrary validates and allocates real ISBNs; it never manufactures ISBN numbers.',
    '            Choose who is publisher of record. Publish with ScrollLibrary Press when its verified publisher range is active, use ISBNs registered to your own imprint, or choose Amazon’s KDP-only free ISBN. ScrollLibrary never manufactures or resells ISBNs.',
    "publishing identity explanatory copy",
  );
  source = replaceOnce(
    source,
    '<SelectItem value="own_imprint">My registered publisher / imprint</SelectItem>\n            <SelectItem value="platform_imprint" disabled={(data?.platformImprints.length ?? 0) === 0}>Verified ScrollLibrary publishing imprint</SelectItem>',
    '<SelectItem value="own_imprint">Use my own ISBN / registered imprint</SelectItem>\n            <SelectItem value="platform_imprint" disabled={!(data?.platformImprints.some((row) => row.availableIsbns > 0) ?? false)}>Publish with ScrollLibrary Press — ISBN included</SelectItem>',
    "publishing route product wording",
  );
  source = replaceOnce(
    source,
    '<SelectItem key={row.id} value={row.id}>{row.imprint_name} — {row.publisher_name} ({row.availableIsbns} ISBNs available)</SelectItem>',
    '<SelectItem key={row.id} value={row.id} disabled={row.availableIsbns <= 0}>{row.imprint_name} — {row.publisher_name} ({row.availableIsbns} ISBNs available)</SelectItem>',
    "disable empty platform ISBN inventory",
  );
  source = replaceOnce(
    source,
    '<AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />No verified platform imprint/ISBN pool is configured. An administrator must load ISBNs obtained from an authorized ISBN agency before this option can be used.',
    '<AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />ScrollLibrary Press is not yet activated as publisher of record. A verified publisher registration and legitimate ISBN inventory from the authorized ISBN agency must be loaded before “ISBN included” can be offered.',
    "platform imprint unavailable copy",
  );
  return source;
});

await patch("supabase/functions/publishing-identity/index.ts", (source) => {
  source = replaceOnce(
    source,
    `        if (!platform || platform.scope !== "platform" || platform.verified !== true) {\n          return badRequest("Selected platform imprint is not verified");\n        }\n        imprintId = platform.id;`,
    `        if (!platform || platform.scope !== "platform" || platform.verified !== true) {\n          return badRequest("Selected platform imprint is not verified");\n        }\n        const { count: availablePool, error: poolErr } = await sc\n          .from("isbn_inventory")\n          .select("id", { count: "exact", head: true })\n          .eq("imprint_id", platform.id)\n          .eq("source", "platform_pool")\n          .eq("status", "available");\n        if (poolErr) return serverError(poolErr);\n        if (!availablePool) {\n          return badRequest("ScrollLibrary Press ISBN inventory is currently unavailable");\n        }\n        imprintId = platform.id;`,
    "platform route requires available ISBN inventory",
  );
  return source;
});

console.log("Publishing identity release-gate repairs applied successfully.");
