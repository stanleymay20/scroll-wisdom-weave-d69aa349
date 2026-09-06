import {
  barcodeBoxPosition,
  buildEan13Bits,
  buildKdpPrintCoverPdf,
  computeKdpCoverGeometry,
  getKdpPaperbackPageLimits,
  getPdfPageCount,
  requireKdpPaperbackPageCount,
} from "./kdp-print-cover.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function approx(actual: number, expected: number, epsilon = 0.000001) {
  assert(Math.abs(actual - expected) <= epsilon, `expected ${expected}, got ${actual}`);
}

Deno.test("KDP 6x9 white-paper geometry follows page-count spine formula", () => {
  const geometry = computeKdpCoverGeometry(300, "6x9", "white");
  approx(geometry.spineWidthIn, 300 * 0.002252);
  approx(geometry.totalWidthIn, 0.125 + 6 + (300 * 0.002252) + 6 + 0.125);
  approx(geometry.totalHeightIn, 9.25);
  assert(geometry.sourcePageCount === 300 && geometry.effectivePageCount === 300, "even page count should remain unchanged");
  assert(geometry.spineTextAllowed, "300-page paperback should allow safe spine text");
});

Deno.test("KDP odd manuscript page count rounds up before spine calculation", () => {
  const geometry = computeKdpCoverGeometry(299, "6x9", "white");
  assert(geometry.sourcePageCount === 299, "source page count should be retained for audit metadata");
  assert(geometry.effectivePageCount === 300, "KDP page count should round odd manuscripts up to even");
  approx(geometry.spineWidthIn, 300 * 0.002252);
});

Deno.test("KDP cover rejects manuscripts below the 24-page minimum", () => {
  let rejected = false;
  try {
    computeKdpCoverGeometry(23, "6x9", "white");
  } catch (error) {
    rejected = error instanceof Error && error.message === "KDP_PAGE_COUNT_OUT_OF_RANGE:23:allowed_24_828";
  }
  assert(rejected, "sub-24-page KDP paperback must be rejected");
});

Deno.test("KDP page-limit matrix keeps format-specific minimums and maximums", () => {
  const tradeWhite = getKdpPaperbackPageLimits("6x9", "white");
  assert(tradeWhite.min === 24 && tradeWhite.max === 828, "wrong 6x9 white-paper limits");

  const largeCream = getKdpPaperbackPageLimits("8.5x11", "cream");
  assert(largeCream.min === 24 && largeCream.max === 550, "wrong 8.5x11 cream-paper limits");

  const standardColor = getKdpPaperbackPageLimits("6x9", "standard_color");
  assert(standardColor.min === 72 && standardColor.max === 600, "wrong standard-color limits");
});

Deno.test("KDP source minimum is enforced before odd-page geometry rounding", () => {
  let rejected = false;
  try {
    requireKdpPaperbackPageCount(71, "6x9", "standard_color");
  } catch (error) {
    rejected = error instanceof Error && error.message === "KDP_PAGE_COUNT_OUT_OF_RANGE:71:allowed_72_600";
  }
  assert(rejected, "71 source pages must not become an eligible 72-page standard-color book by rounding");
  assert(requireKdpPaperbackPageCount(72, "6x9", "standard_color") === 72, "72 pages should satisfy the minimum");
});

Deno.test("KDP maximum is enforced after odd-page geometry rounding", () => {
  assert(requireKdpPaperbackPageCount(827, "6x9", "white") === 828, "827 pages should round to the 828-page maximum");

  let rejected = false;
  try {
    requireKdpPaperbackPageCount(829, "6x9", "white");
  } catch (error) {
    rejected = error instanceof Error && error.message === "KDP_PAGE_COUNT_OUT_OF_RANGE:830:allowed_24_828";
  }
  assert(rejected, "an odd page count must not round beyond the KDP maximum");
});

Deno.test("short/thin books omit spine text when 7pt cannot fit safely", () => {
  const geometry = computeKdpCoverGeometry(80, "6x9", "white");
  assert(!geometry.spineTextAllowed, "80-page white-paper spine is too thin for safe 7pt text");
});

Deno.test("EAN-13 encoder emits the standard 95 modules and guard patterns", () => {
  const bits = buildEan13Bits("9780306406157");
  assert(bits.length === 95, `expected 95 modules, got ${bits.length}`);
  assert(bits.startsWith("101"), "missing left guard");
  assert(bits.slice(45, 50) === "01010", "missing center guard");
  assert(bits.endsWith("101"), "missing right guard");
});

Deno.test("EAN-13 encoder rejects a checksum-invalid ISBN", () => {
  let rejected = false;
  try {
    buildEan13Bits("9780306406158");
  } catch (error) {
    rejected = error instanceof Error && error.message === "INVALID_ISBN13";
  }
  assert(rejected, "invalid ISBN-13 must be rejected");
});

Deno.test("barcode zone stays on the lower back cover away from the spine fold", () => {
  const geometry = computeKdpCoverGeometry(300, "6x9", "cream");
  const box = barcodeBoxPosition(geometry);
  approx(box.widthIn, 2);
  approx(box.heightIn, 1.2);
  assert(box.xIn + box.widthIn <= geometry.spineLeftIn - 0.25 + 1e-9, "barcode is too close to spine fold");
  assert(box.yIn >= 0.125 + 0.76, "barcode is too close to bottom trim/bleed");
});

Deno.test("print cover builder emits a one-page PDF with owned ISBN barcode", async () => {
  // 1x1 PNG; sufficient for a structural renderer test. Production acquisition
  // enforces real cover dimensions/quality upstream.
  const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=";
  const coverBytes = Uint8Array.from(atob(pngBase64), (c) => c.charCodeAt(0));
  const result = await buildKdpPrintCoverPdf({
    frontCoverBytes: coverBytes,
    frontCoverMime: "image/png",
    title: "Publication Trust Test",
    authorName: "ScrollLibrary",
    backBlurb: "A deterministic print-cover test fixture.",
    publisherName: "Example Publisher",
    imprintName: "Example Imprint",
    editionLabel: "First edition",
    isbn13: "9780306406157",
    barcodeMode: "owned_isbn",
    pageCount: 220,
    trimSize: "6x9",
    paperType: "white",
  });
  assert(result.bytes.byteLength > 500, "cover PDF unexpectedly small");
  assert(await getPdfPageCount(result.bytes) === 1, "cover PDF must have exactly one page");
  assert(result.isbn13 === "9780306406157", "ISBN should survive canonicalization");
  assert(result.barcodeMode === "owned_isbn", "wrong barcode mode");
});

Deno.test("KDP-assigned barcode mode never accepts a supplied ISBN", async () => {
  const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=";
  const coverBytes = Uint8Array.from(atob(pngBase64), (c) => c.charCodeAt(0));
  let rejected = false;
  try {
    await buildKdpPrintCoverPdf({
      frontCoverBytes: coverBytes,
      frontCoverMime: "image/png",
      title: "No Synthetic ISBN",
      isbn13: "9780306406157",
      barcodeMode: "kdp_assigned",
      pageCount: 120,
      trimSize: "6x9",
      paperType: "white",
    });
  } catch (error) {
    rejected = error instanceof Error && error.message === "KDP_ASSIGNED_BARCODE_MUST_NOT_CARRY_ISBN";
  }
  assert(rejected, "KDP-assigned mode must not draw a user-supplied ISBN barcode");
});
