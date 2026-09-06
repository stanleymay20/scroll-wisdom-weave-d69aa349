import { readFile, writeFile } from "node:fs/promises";

function replaceOnce(source, needle, replacement, label) {
  const first = source.indexOf(needle);
  if (first < 0) throw new Error(`${label}: pattern not found`);
  if (source.indexOf(needle, first + needle.length) >= 0) throw new Error(`${label}: pattern not unique`);
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
}

const coverPath = "supabase/functions/_shared/kdp-print-cover.ts";
let cover = await readFile(coverPath, "utf8");
cover = replaceOnce(
  cover,
  "export interface KdpCoverGeometry {\n  trimWidthIn: number;",
  "export interface KdpCoverGeometry {\n  sourcePageCount: number;\n  effectivePageCount: number;\n  trimWidthIn: number;",
  "cover geometry page-count fields",
);
cover = replaceOnce(
  cover,
  "  if (!Number.isInteger(pageCount) || pageCount < 1) throw new Error(\"INVALID_PAGE_COUNT\");\n",
  "  if (!Number.isInteger(pageCount) || pageCount < 1) throw new Error(\"INVALID_PAGE_COUNT\");\n  const effectivePageCount = pageCount % 2 === 0 ? pageCount : pageCount + 1;\n  if (effectivePageCount < 24) throw new Error(\"KDP_MIN_PAGE_COUNT_24\");\n",
  "effective page count",
);
cover = replaceOnce(
  cover,
  "  const spineWidthIn = pageCount * perPage;\n",
  "  const spineWidthIn = effectivePageCount * perPage;\n",
  "spine uses effective page count",
);
cover = replaceOnce(
  cover,
  "  const spineTextAllowed = pageCount > 79 && usableSpinePt >= 7;\n\n  return {\n    trimWidthIn: trim.width,",
  "  const spineTextAllowed = effectivePageCount > 79 && usableSpinePt >= 7;\n\n  return {\n    sourcePageCount: pageCount,\n    effectivePageCount,\n    trimWidthIn: trim.width,",
  "return KDP page counts",
);
await writeFile(coverPath, cover);

const bundlePath = "supabase/functions/enqueue-export-bundle/index.ts";
let bundle = await readFile(bundlePath, "utf8");
bundle = replaceOnce(
  bundle,
  "    const coverSeed = (listing as any)?.cover_override_url || book.cover_image_url || null;\n",
  "    // KDP print output must use the canonical cover bound into the publication\n    // hash/rights provenance. Mutable storefront overrides are never print authority.\n    const coverSeed = bundleType === \"kdp\"\n      ? (book.cover_image_url || null)\n      : ((listing as any)?.cover_override_url || book.cover_image_url || null);\n",
  "canonical KDP cover source",
);
bundle = replaceOnce(
  bundle,
  "    let kdpPrintCover: Awaited<ReturnType<typeof buildKdpPrintCoverPdf>> | null = null;\n",
  "    let kdpPrintCover: Awaited<ReturnType<typeof buildKdpPrintCoverPdf>> | null = null;\n    let kdpSourcePageCount: number | null = null;\n",
  "KDP source page count variable",
);
bundle = replaceOnce(
  bundle,
  "      const pageCount = await getPdfPageCount(mainPdf);\n",
  "      const pageCount = await getPdfPageCount(mainPdf);\n      kdpSourcePageCount = pageCount;\n",
  "capture source page count",
);
bundle = replaceOnce(
  bundle,
  "          page_count: pageCount,\n          trim_size: requestedTrim,",
  "          source_page_count: pageCount,\n          kdp_page_count: kdpPrintCover.geometry.effectivePageCount,\n          trim_size: requestedTrim,",
  "KDP timer page-count metadata",
);
bundle = replaceOnce(
  bundle,
  "          page_count: await getPdfPageCount(mainPdf!),\n          trim_size: options.trim_size ?? \"6x9\",",
  "          source_page_count: kdpSourcePageCount,\n          kdp_page_count: kdpPrintCover.geometry.effectivePageCount,\n          trim_size: options.trim_size ?? \"6x9\",",
  "KDP export page-count metadata",
);
await writeFile(bundlePath, bundle);
console.log("KDP cover page-count and canonical-cover authority repaired.");
