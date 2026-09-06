import { readFile, writeFile } from "node:fs/promises";

const path = "supabase/functions/enqueue-export-bundle/index.ts";
let source = await readFile(path, "utf8");

function replaceOnce(needle, replacement, label) {
  const first = source.indexOf(needle);
  if (first < 0) throw new Error(`${label}: pattern not found`);
  if (source.indexOf(needle, first + needle.length) >= 0) throw new Error(`${label}: pattern not unique`);
  source = source.slice(0, first) + replacement + source.slice(first + needle.length);
}

replaceOnce(
  'import { isbnForPublicationSnapshot, publisherFromPublicationSnapshot } from "../_shared/isbn.ts";\n',
  'import { isbnForPublicationSnapshot, publisherFromPublicationSnapshot } from "../_shared/isbn.ts";\nimport { buildKdpPrintCoverPdf, getPdfPageCount, type KdpPaperType, type KdpTrimSize } from "../_shared/kdp-print-cover.ts";\n',
  'KDP cover import',
);

replaceOnce(
`    const cover = coverSeed ? await fetchImageAsset(coverSeed) : null;
    await timer.stop("cover", {
      metadata: {
        ok: !!cover, bytes: cover?.bytes.byteLength ?? 0,
        width: cover?.widthPx ?? null, height: cover?.heightPx ?? null,
      },
    });
`,
`    const cover = coverSeed ? await fetchImageAsset(coverSeed) : null;
    await timer.stop("cover", {
      metadata: {
        ok: !!cover, bytes: cover?.bytes.byteLength ?? 0,
        width: cover?.widthPx ?? null, height: cover?.heightPx ?? null,
      },
    });

    // ─── KDP full-wrap cover (back + spine + front) ───────────────────
    // The wrap is derived from the already-rendered interior page count and the
    // immutable Publication identity. Browser-supplied ISBN/publisher/author
    // values never enter this path.
    let kdpPrintCover: Awaited<ReturnType<typeof buildKdpPrintCoverPdf>> | null = null;
    if (bundleType === "kdp") {
      if (!mainPdf) throw new Error("KDP interior PDF is required before cover composition.");
      if (!cover) throw new Error("KDP_PRINT_COVER_REQUIRED");

      const supportedTrims = new Set<KdpTrimSize>(["5x8", "5.25x8", "5.5x8.5", "6x9", "7x10", "8.5x11"]);
      const requestedTrim = String(options.trim_size ?? "6x9") as KdpTrimSize;
      if (!supportedTrims.has(requestedTrim)) throw new Error("INVALID_KDP_TRIM_SIZE");

      const supportedPaper = new Set<KdpPaperType>(["white", "cream", "groundwood", "standard_color", "premium_color"]);
      const requestedPaper = String(options.paper_type ?? "white") as KdpPaperType;
      if (!supportedPaper.has(requestedPaper)) throw new Error("INVALID_KDP_PAPER_TYPE");

      const pageCount = await getPdfPageCount(mainPdf);
      const paperbackIsbn = isbnForPublicationSnapshot(publicationSnapshot, "kdp-pdf");
      const printStrategy = typeof publicationSnapshot.print_identifier_strategy === "string"
        ? publicationSnapshot.print_identifier_strategy
        : null;
      const barcodeMode = printStrategy === "kdp_free" ? "kdp_assigned" as const : "owned_isbn" as const;
      if (barcodeMode === "kdp_assigned" && paperbackIsbn) {
        throw new Error("KDP_FREE_STRATEGY_MUST_NOT_CARRY_OWNED_ISBN");
      }
      if (barcodeMode === "owned_isbn" && !paperbackIsbn) {
        throw new Error("VALID_PAPERBACK_ISBN_REQUIRED_FOR_KDP_BUNDLE");
      }

      const frozenAuthors = Array.isArray(publicationSnapshot.authors)
        ? publicationSnapshot.authors as Array<Record<string, unknown>>
        : [];
      const primaryAuthor = frozenAuthors
        .find((row) => row.author_role === "primary" && typeof row.display_name === "string")
        ?? frozenAuthors.find((row) => typeof row.display_name === "string")
        ?? null;
      const frozenAuthorName = primaryAuthor && typeof primaryAuthor.display_name === "string"
        ? primaryAuthor.display_name
        : null;

      kdpPrintCover = await buildKdpPrintCoverPdf({
        frontCoverBytes: cover.bytes,
        frontCoverMime: cover.mime,
        title: typeof publicationSnapshot.title === "string" ? publicationSnapshot.title : book.title,
        authorName: frozenAuthorName,
        backBlurb: listing?.blurb ?? book.description ?? null,
        publisherName: publisherIdentity.publisherName,
        imprintName: publisherIdentity.imprintName,
        editionLabel: typeof publicationSnapshot.edition === "string" ? publicationSnapshot.edition : null,
        isbn13: paperbackIsbn,
        barcodeMode,
        pageCount,
        trimSize: requestedTrim,
        paperType: requestedPaper,
      });
      await timer.stop("kdp_cover", {
        metadata: {
          bytes: kdpPrintCover.bytes.byteLength,
          page_count: pageCount,
          trim_size: requestedTrim,
          paper_type: requestedPaper,
          spine_width_in: kdpPrintCover.geometry.spineWidthIn,
          barcode_mode: barcodeMode,
          spine_text_rendered: kdpPrintCover.spineTextRendered,
        },
      });
    }
`,
  'KDP full-wrap composition',
);

replaceOnce(
`    if (mainPdf) {
      const pdfName = bundleType === "kdp" ? "interior.pdf"
        : bundleType === "etsy" ? "printable.pdf"
        : "book.pdf";
      zip.file(pdfName, mainPdf);
      included.push(\`${'${pdfName}'} — print/PDF\`);
    }
`,
`    if (mainPdf) {
      const pdfName = bundleType === "kdp" ? "interior.pdf"
        : bundleType === "etsy" ? "printable.pdf"
        : "book.pdf";
      zip.file(pdfName, mainPdf);
      included.push(\`${'${pdfName}'} — print/PDF\`);
    }
    if (kdpPrintCover) {
      zip.file("cover.pdf", kdpPrintCover.bytes);
      included.push("cover.pdf — KDP full-wrap print cover (back + spine + front)");
    }
`,
  'KDP cover ZIP inclusion',
);

replaceOnce(
`        cover_attached: !!cover,
        cover_dimensions: cover && cover.widthPx && cover.heightPx
          ? { width: cover.widthPx, height: cover.heightPx, mime: cover.mime } : null,
        epub_attached: !!epubBytes,
`,
`        cover_attached: !!cover,
        cover_dimensions: cover && cover.widthPx && cover.heightPx
          ? { width: cover.widthPx, height: cover.heightPx, mime: cover.mime } : null,
        kdp_print_cover: kdpPrintCover ? {
          attached: true,
          page_count: await getPdfPageCount(mainPdf!),
          trim_size: options.trim_size ?? "6x9",
          paper_type: options.paper_type ?? "white",
          spine_width_in: kdpPrintCover.geometry.spineWidthIn,
          total_width_in: kdpPrintCover.geometry.totalWidthIn,
          total_height_in: kdpPrintCover.geometry.totalHeightIn,
          barcode_mode: kdpPrintCover.barcodeMode,
          isbn13: kdpPrintCover.isbn13,
          spine_text_rendered: kdpPrintCover.spineTextRendered,
        } : null,
        epub_attached: !!epubBytes,
`,
  'KDP cover export metadata',
);

if (!source.includes('zip.file("cover.pdf", kdpPrintCover.bytes)')) throw new Error('cover.pdf integration missing');
if (!source.includes('VALID_PAPERBACK_ISBN_REQUIRED_FOR_KDP_BUNDLE')) throw new Error('ISBN fail-closed gate missing');
await writeFile(path, source);
console.log('KDP print cover integrated into bundle path.');
