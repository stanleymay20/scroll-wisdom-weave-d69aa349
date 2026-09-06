import { readFile, writeFile } from "node:fs/promises";

const path = "supabase/functions/_shared/kdp-print-cover.ts";
let source = await readFile(path, "utf8");

function replaceOnce(needle, replacement, label) {
  const first = source.indexOf(needle);
  if (first < 0) throw new Error(`${label}: pattern not found`);
  if (source.indexOf(needle, first + needle.length) >= 0) throw new Error(`${label}: pattern not unique`);
  source = source.slice(0, first) + replacement + source.slice(first + needle.length);
}

replaceOnce(
`const SPINE_PER_PAGE_IN: Record<KdpPaperType, number> = {
  white: 0.002252,
  cream: 0.0025,
  groundwood: 0.00235,
  standard_color: 0.002252,
  premium_color: 0.002347,
};
`,
`const SPINE_PER_PAGE_IN: Record<KdpPaperType, number> = {
  white: 0.002252,
  cream: 0.0025,
  groundwood: 0.00235,
  standard_color: 0.002252,
  premium_color: 0.002347,
};

const PAGE_LIMITS_DEFAULT: Record<KdpPaperType, { min: number; max: number }> = {
  white: { min: 24, max: 828 },
  cream: { min: 24, max: 776 },
  groundwood: { min: 24, max: 812 },
  standard_color: { min: 72, max: 600 },
  premium_color: { min: 24, max: 828 },
};

const PAGE_LIMITS_8_5_X_11: Record<KdpPaperType, { min: number; max: number }> = {
  white: { min: 24, max: 590 },
  cream: { min: 24, max: 550 },
  groundwood: { min: 24, max: 578 },
  standard_color: { min: 72, max: 600 },
  premium_color: { min: 24, max: 590 },
};

export function getKdpPaperbackPageLimits(trimSize: KdpTrimSize, paperType: KdpPaperType) {
  const table = trimSize === "8.5x11" ? PAGE_LIMITS_8_5_X_11 : PAGE_LIMITS_DEFAULT;
  const limit = table[paperType];
  if (!limit) throw new Error("INVALID_KDP_PRINT_COMBINATION");
  return { ...limit };
}

export function requireKdpPaperbackPageCount(pageCount: number, trimSize: KdpTrimSize, paperType: KdpPaperType): number {
  if (!Number.isInteger(pageCount) || pageCount < 1) throw new Error("INVALID_PAGE_COUNT");
  const effectivePageCount = pageCount % 2 === 0 ? pageCount : pageCount + 1;
  const { min, max } = getKdpPaperbackPageLimits(trimSize, paperType);
  if (effectivePageCount < min || effectivePageCount > max) {
    throw new Error("KDP_PAGE_COUNT_OUT_OF_RANGE:" + effectivePageCount + ":allowed_" + min + "_" + max);
  }
  return effectivePageCount;
}
`,
  "page limit tables",
);

replaceOnce(
`  if (!Number.isInteger(pageCount) || pageCount < 1) throw new Error("INVALID_PAGE_COUNT");
  const effectivePageCount = pageCount % 2 === 0 ? pageCount : pageCount + 1;
  if (effectivePageCount < 24) throw new Error("KDP_MIN_PAGE_COUNT_24");
  const trim = TRIMS[trimSize];
`,
`  if (!Number.isInteger(pageCount) || pageCount < 1) throw new Error("INVALID_PAGE_COUNT");
  const trim = TRIMS[trimSize];
`,
  "remove generic page floor",
);

replaceOnce(
`  const perPage = SPINE_PER_PAGE_IN[paperType];
  if (!perPage) throw new Error("INVALID_PAPER_TYPE");

  const spineWidthIn = effectivePageCount * perPage;
`,
`  const perPage = SPINE_PER_PAGE_IN[paperType];
  if (!perPage) throw new Error("INVALID_PAPER_TYPE");
  const effectivePageCount = requireKdpPaperbackPageCount(pageCount, trimSize, paperType);

  const spineWidthIn = effectivePageCount * perPage;
`,
  "apply KDP page matrix",
);

await writeFile(path, source);
console.log("KDP paperback page-limit matrix enforced.");
