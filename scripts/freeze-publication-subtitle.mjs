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

await patch("supabase/functions/publish-work/index.ts", (source) => {
  source = replaceOnce(
    source,
    '    if (!book?.id) return json({ error: "publication_blocked", reason: "book_record_required" }, 409);\n',
    '    if (!book?.id) return json({ error: "publication_blocked", reason: "book_record_required" }, 409);\n\n    // Subtitle is bibliographic identity, not mutable storefront decoration.\n    // Freeze exactly the subtitle that was covered by the publication hash.\n    const { data: listingIdentity, error: listingIdentityErr } = await sc\n      .from("public_listings")\n      .select("subtitle")\n      .eq("book_id", book.id)\n      .maybeSingle();\n    if (listingIdentityErr) return serverError(listingIdentityErr);\n',
    "publish-work listing identity load",
  );
  source = replaceOnce(
    source,
    '    const snapshot = {\n      title: work.title,\n      language:',
    '    const snapshot = {\n      title: work.title,\n      subtitle: listingIdentity?.subtitle ?? null,\n      language:',
    "publish-work subtitle snapshot",
  );
  return source;
});

await patch("supabase/functions/enqueue-export-bundle/index.ts", (source) => replaceOnce(
  source,
  '        id: book.id, title: book.title, subtitle: (listing as any)?.subtitle ?? null,',
  '        id: book.id, title: book.title, subtitle: typeof publicationSnapshot.subtitle === "string" ? publicationSnapshot.subtitle : null,',
  "bundle immutable subtitle",
));

await patch("supabase/functions/_shared/epub-builder.ts", (source) => replaceOnce(
  source,
  '  const subtitle = input.listing?.subtitle ? `<meta property="dcterms:alternative">${escXml(input.listing.subtitle)}</meta>` : "";',
  '  const canonicalSubtitle = input.book.subtitle ?? input.listing?.subtitle ?? null;\n  const subtitle = canonicalSubtitle ? `<meta property="dcterms:alternative">${escXml(canonicalSubtitle)}</meta>` : "";',
  "EPUB canonical subtitle priority",
));

await patch("supabase/functions/_shared/bundle-content.ts", (source) => replaceOnce(
  source,
  '    subtitle: ctx.listing?.subtitle ?? ctx.book.subtitle ?? "",',
  '    subtitle: ctx.book.subtitle ?? ctx.listing?.subtitle ?? "",',
  "bundle manifest canonical subtitle priority",
));

console.log("Publication subtitle identity patch applied.");
