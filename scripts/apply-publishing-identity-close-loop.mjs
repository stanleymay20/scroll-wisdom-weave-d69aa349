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

await patch("src/pages/BookPublishSettings.tsx", (source) => {
  source = replaceOnce(
    source,
    'import { EliteReadinessPanel } from "@/components/publish/EliteReadinessPanel";\n',
    'import { EliteReadinessPanel } from "@/components/publish/EliteReadinessPanel";\nimport { PublishingIdentityPanel } from "@/components/publish/PublishingIdentityPanel";\n',
    "BookPublishSettings import",
  );
  source = replaceOnce(
    source,
    '{bookId && <div className="mt-6"><EliteReadinessPanel bookId={bookId} /></div>}\n',
    '{bookId && <div className="mt-6"><EliteReadinessPanel bookId={bookId} /></div>}\n        {bookId && <div className="mt-6"><PublishingIdentityPanel bookId={bookId} /></div>}\n',
    "BookPublishSettings identity panel",
  );
  return source;
});

await patch("src/components/books/ExportDialog.tsx", (source) => replaceOnce(
  source,
  `          if (Array.isArray(snap.rights_holders) && snap.rights_holders.length) {\n            resolved.publisher = snap.rights_holders[0]?.display_name || null;\n            resolved.copyright = resolved.publisher;\n          }\n          resolved.isbn = snap.isbn || snap.isbn_13 || null;\n          resolved.edition = snap.edition || null;`,
  `          const publisher = snap.publisher && typeof snap.publisher === "object" && !Array.isArray(snap.publisher)\n            ? snap.publisher\n            : null;\n          resolved.publisher = publisher?.imprint_name || publisher?.publisher_name || snap.publisher_imprint || snap.publisher_name || null;\n          // Legacy snapshots may not have a dedicated publisher object. Rights\n          // holder fallback is display-only and never used as canonical publisher\n          // when the new publishing identity exists.\n          if (!resolved.publisher && Array.isArray(snap.rights_holders) && snap.rights_holders.length) {\n            resolved.publisher = snap.rights_holders[0]?.display_name || null;\n          }\n          resolved.copyright = Array.isArray(snap.rights_holders) && snap.rights_holders.length\n            ? snap.rights_holders[0]?.display_name || resolved.publisher\n            : resolved.publisher;\n          resolved.isbn = snap.isbn_by_format?.paperback || snap.isbn_by_format?.hardcover || snap.isbn || snap.isbn_13 || null;\n          resolved.edition = snap.edition || null;`,
  "ExportDialog canonical publisher",
));

await patch("supabase/functions/_shared/bundle-content.ts", (source) => {
  source = replaceOnce(
    source,
    `  /** Optional ISBN for the copyright page. */\n  isbn?: string | null;\n}`,
    `  /** Format-specific ISBN selected from the immutable Publication snapshot. */\n  isbn?: string | null;\n  /** Canonical publisher legal/registrant name. */\n  publisherName?: string | null;\n  /** Canonical imprint displayed on the book. */\n  publisherImprint?: string | null;\n  /** All frozen ISBN-13 assignments keyed by product form. */\n  isbnByFormat?: Record<string, string> | null;\n  /** Identifier strategy for the target product (own/platform/KDP free/unassigned). */\n  identifierStrategy?: string | null;\n  /** Distribution scope frozen into the publication identity. */\n  distributionScope?: string | null;\n}`,
    "BundleExtras identity fields",
  );
  source = replaceOnce(
    source,
    `  const publisher = "ScrollLibrary";`,
    `  const publisher = extras?.publisherImprint || extras?.publisherName || "Independent publisher";`,
    "front matter publisher",
  );
  source = replaceOnce(
    source,
    `  lines.push(\`Published via \${publisher}.\`, \`\`);`,
    `  lines.push(\`Published by \${publisher}.\`, \`\`);`,
    "front matter published by",
  );
  source = replaceOnce(
    source,
    `  author: { display_name: string | null; bio_preview: string | null } | null;\n  pricing: { amount_cents: number; currency: string; label: string };`,
    `  author: { display_name: string | null; bio_preview: string | null } | null;\n  publisher: { publisher_name: string | null; imprint_name: string | null };\n  isbn13: string | null;\n  isbn_by_format: Record<string, string>;\n  identifier_strategy: string | null;\n  distribution_scope: string | null;\n  pricing: { amount_cents: number; currency: string; label: string };`,
    "manifest identity shape",
  );
  source = replaceOnce(
    source,
    `const BUNDLE_SCHEMA_VERSION = "2.0.0";`,
    `const BUNDLE_SCHEMA_VERSION = "3.0.0";`,
    "bundle schema version",
  );
  source = replaceOnce(
    source,
    `    author: ctx.author\n      ? {\n        display_name: ctx.author.display_name ?? null,\n        bio_preview: ctx.author.bio ? cleanProse(ctx.author.bio, 200) : null,\n      }\n      : null,\n    pricing: {`,
    `    author: ctx.author\n      ? {\n        display_name: ctx.author.display_name ?? null,\n        bio_preview: ctx.author.bio ? cleanProse(ctx.author.bio, 200) : null,\n      }\n      : null,\n    publisher: {\n      publisher_name: ctx.extras?.publisherName ?? null,\n      imprint_name: ctx.extras?.publisherImprint ?? null,\n    },\n    isbn13: ctx.extras?.isbn ?? null,\n    isbn_by_format: ctx.extras?.isbnByFormat ?? {},\n    identifier_strategy: ctx.extras?.identifierStrategy ?? null,\n    distribution_scope: ctx.extras?.distributionScope ?? null,\n    pricing: {`,
    "manifest identity values",
  );
  source = replaceOnce(
    source,
    `  lines.push(\`**License:** \${humanLicense(listing?.license_type)}\`, \`\`);\n  if (ctx.correlationId) lines.push(\`**Support reference:** \${ctx.correlationId}\`, \`\`);`,
    `  lines.push(\`**License:** \${humanLicense(listing?.license_type)}\`, \`\`);\n  const publisher = ctx.extras?.publisherImprint || ctx.extras?.publisherName;\n  if (publisher) lines.push(\`**Publisher / imprint:** \${publisher}\`, \`\`);\n  if (ctx.extras?.isbn) lines.push(\`**ISBN-13 for this bundle:** \${ctx.extras.isbn}\`, \`\`);\n  if (platform === "kdp" && ctx.extras?.identifierStrategy === "kdp_free") {\n    lines.push(\`**ISBN strategy:** Amazon KDP free ISBN — assigned during KDP submission; imprint shown by Amazon as Independently published.\`, \`\`);\n  }\n  if (ctx.correlationId) lines.push(\`**Support reference:** \${ctx.correlationId}\`, \`\`);`,
    "README publishing identity",
  );
  return source;
});

await patch("supabase/functions/enqueue-export-bundle/index.ts", (source) => {
  source = replaceOnce(
    source,
    `} from "../_shared/bundle-content.ts";\n`,
    `} from "../_shared/bundle-content.ts";\nimport { isbnForPublicationSnapshot, publisherFromPublicationSnapshot } from "../_shared/isbn.ts";\n`,
    "bundle ISBN helper import",
  );
  source = replaceOnce(
    source,
    `.select("id, title, description, cover_image_url, category, book_type, user_id, academic_level")`,
    `.select("id, title, description, cover_image_url, category, book_type, user_id, academic_level, current_publication_id, ai_assistance_level, dedication, epigraph")`,
    "bundle book canonical fields",
  );
  source = replaceOnce(
    source,
    `    const { data: author } = await sc.from("author_profiles")\n      .select("display_name, bio, website_url, x_url, linkedin_url, avatar_url")\n      .eq("user_id", userId).maybeSingle();\n\n    await timer.stop("fetch_book", { metadata: { chapters: chapterList.length } });`,
    `    const { data: author } = await sc.from("author_profiles")\n      .select("display_name, bio, website_url, x_url, linkedin_url, avatar_url")\n      .eq("user_id", userId).maybeSingle();\n\n    // Distribution bundles are generated only from an immutable published\n    // snapshot. Draft exports remain available through export-book, but a KDP/\n    // storefront bundle must not carry mutable or browser-supplied identity.\n    if (!book.current_publication_id) {\n      throw new Error("Publish and certify this book before building a distribution bundle.");\n    }\n    const { data: publication, error: publicationErr } = await sc\n      .from("publications")\n      .select("id,status,snapshot,content_hash")\n      .eq("id", book.current_publication_id)\n      .eq("status", "published")\n      .maybeSingle();\n    if (publicationErr) throw new Error(\`Publication load failed: \${publicationErr.message}\`);\n    if (!publication) throw new Error("The current Publication snapshot is missing or not published.");\n    const publicationSnapshot = (publication.snapshot ?? {}) as Record<string, unknown>;\n\n    await timer.stop("fetch_book", { metadata: { chapters: chapterList.length, publication_id: publication.id } });`,
    "bundle published snapshot load",
  );
  source = replaceOnce(
    source,
    `    // Elite extras: AI disclosure level, ISBN, dedication, epigraph. All\n    // optional — the renderer skips sections that aren't supplied.\n    const extras: BundleExtras = {\n      aiAssistanceLevel: (book as any).ai_assistance_level ?? null,\n      isbn: (book as any).isbn ?? null,\n      dedication: (book as any).dedication ?? null,\n      epigraph: typeof (book as any).epigraph === "object"\n        ? ((book as any).epigraph as { text: string; attribution?: string | null })\n        : null,\n    };`,
    `    // Publication identity comes only from the immutable snapshot. KDP gets\n    // the paperback ISBN; digital bundles get the EPUB ISBN. Never reuse a print\n    // ISBN for a separately sold EPUB product.\n    const bundleExportFormat = bundleType === "kdp" ? "kdp-pdf" : "epub";\n    const publisherIdentity = publisherFromPublicationSnapshot(publicationSnapshot);\n    const isbnByFormat = publicationSnapshot.isbn_by_format && typeof publicationSnapshot.isbn_by_format === "object"\n      ? publicationSnapshot.isbn_by_format as Record<string, string>\n      : {};\n    const identifierStrategy = bundleType === "kdp"\n      ? (publicationSnapshot.print_identifier_strategy as string | undefined)\n      : (publicationSnapshot.ebook_identifier_strategy as string | undefined);\n    const extras: BundleExtras = {\n      aiAssistanceLevel: (book as any).ai_assistance_level ?? null,\n      isbn: isbnForPublicationSnapshot(publicationSnapshot, bundleExportFormat),\n      publisherName: publisherIdentity.publisherName,\n      publisherImprint: publisherIdentity.imprintName,\n      isbnByFormat,\n      identifierStrategy: identifierStrategy ?? null,\n      distributionScope: typeof publicationSnapshot.distribution_scope === "string" ? publicationSnapshot.distribution_scope : null,\n      dedication: (book as any).dedication ?? null,\n      epigraph: typeof (book as any).epigraph === "object"\n        ? ((book as any).epigraph as { text: string; attribution?: string | null })\n        : null,\n    };`,
    "bundle canonical identity extras",
  );
  return source;
});

await patch("supabase/functions/export-book/index.ts", (source) => {
  source = replaceOnce(
    source,
    `import { recordExportEvent } from "../_shared/export/audit.ts";\n`,
    `import { recordExportEvent } from "../_shared/export/audit.ts";\nimport { isbnForPublicationSnapshot, publisherFromPublicationSnapshot } from "../_shared/isbn.ts";\n`,
    "export-book ISBN helper import",
  );
  source = replaceOnce(
    source,
    `        if (Array.isArray(snap.rights_holders) && snap.rights_holders.length > 0) {\n          canonicalPublisher = snap.rights_holders[0]?.display_name || null;\n        }\n        canonicalIsbn = snap.isbn || snap.isbn_13 || null;\n        canonicalImprint = snap.publisher_imprint || null;`,
    `        const publisherIdentity = publisherFromPublicationSnapshot(snap);\n        canonicalPublisher = publisherIdentity.publisherName;\n        canonicalImprint = publisherIdentity.imprintName;\n        // Backward-compatible display fallback for old snapshots only. A rights\n        // holder is not treated as publisher once dedicated publisher identity exists.\n        if (!canonicalPublisher && !canonicalImprint && Array.isArray(snap.rights_holders) && snap.rights_holders.length > 0) {\n          canonicalPublisher = snap.rights_holders[0]?.display_name || null;\n        }\n        canonicalIsbn = isbnForPublicationSnapshot(snap, format);`,
    "export-book format-specific identity",
  );
  return source;
});

await patch("src/lib/__tests__/bundleContent.test.ts", (source) => replaceOnce(
  source,
  `expect(m.bundle_schema_version).toBe("2.0.0");`,
  `expect(m.bundle_schema_version).toBe("3.0.0");`,
  "bundle schema test",
));

await patch(".github/workflows/ci.yml", (source) => {
  source = replaceOnce(
    source,
    `          deno check supabase/functions/generate-book/index.ts\n          deno check supabase/functions/generate-chapter/index.ts\n`,
    `          deno check supabase/functions/generate-book/index.ts\n          deno check supabase/functions/generate-chapter/index.ts\n          deno check supabase/functions/publishing-identity/index.ts\n          deno check supabase/functions/publish-work/index.ts\n          deno check supabase/functions/enqueue-export-bundle/index.ts\n          deno check supabase/functions/export-book/index.ts\n`,
    "CI publishing identity functions",
  );
  source = replaceOnce(
    source,
    `          deno test supabase/functions/_shared/structuralConsistency_test.ts\n`,
    `          deno test supabase/functions/_shared/isbn_test.ts\n          deno test supabase/functions/_shared/structuralConsistency_test.ts\n`,
    "CI ISBN tests",
  );
  return source;
});

console.log("Publishing identity close-loop patch applied successfully.");
