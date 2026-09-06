import { PDFDocument, StandardFonts, degrees, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { isValidIsbn13, normalizeIsbn13 } from "./isbn.ts";

export type KdpPaperType = "white" | "cream" | "groundwood" | "standard_color" | "premium_color";
export type KdpTrimSize = "5x8" | "5.25x8" | "5.5x8.5" | "6x9" | "7x10" | "8.5x11";

export interface KdpCoverGeometry {
  sourcePageCount: number;
  effectivePageCount: number;
  trimWidthIn: number;
  trimHeightIn: number;
  bleedIn: number;
  spineWidthIn: number;
  totalWidthIn: number;
  totalHeightIn: number;
  backTrimLeftIn: number;
  backTrimRightIn: number;
  spineLeftIn: number;
  spineRightIn: number;
  frontTrimLeftIn: number;
  frontTrimRightIn: number;
  spineTextAllowed: boolean;
}

export interface KdpPrintCoverInput {
  frontCoverBytes: Uint8Array;
  frontCoverMime: string;
  title: string;
  authorName?: string | null;
  backBlurb?: string | null;
  publisherName?: string | null;
  imprintName?: string | null;
  editionLabel?: string | null;
  isbn13?: string | null;
  barcodeMode: "owned_isbn" | "kdp_assigned";
  pageCount: number;
  trimSize: KdpTrimSize;
  paperType: KdpPaperType;
}

export interface KdpPrintCoverResult {
  bytes: Uint8Array;
  geometry: KdpCoverGeometry;
  barcodeMode: "owned_isbn" | "kdp_assigned";
  isbn13: string | null;
  spineTextRendered: boolean;
}

const PT_PER_IN = 72;
export const KDP_BLEED_IN = 0.125;
export const KDP_BARCODE_BOX_WIDTH_IN = 2;
export const KDP_BARCODE_BOX_HEIGHT_IN = 1.2;
export const KDP_BARCODE_BOTTOM_CLEARANCE_IN = 0.76;
export const KDP_BARCODE_SPINE_CLEARANCE_IN = 0.25;
export const KDP_SPINE_TEXT_FOLD_CLEARANCE_IN = 0.0625;

const TRIMS: Record<KdpTrimSize, { width: number; height: number }> = {
  "5x8": { width: 5, height: 8 },
  "5.25x8": { width: 5.25, height: 8 },
  "5.5x8.5": { width: 5.5, height: 8.5 },
  "6x9": { width: 6, height: 9 },
  "7x10": { width: 7, height: 10 },
  "8.5x11": { width: 8.5, height: 11 },
};

const SPINE_PER_PAGE_IN: Record<KdpPaperType, number> = {
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
  // The source PDF must satisfy KDP's minimum itself. Rounding an odd source
  // count is only valid for cover/spine geometry and must never turn an
  // otherwise ineligible manuscript into an eligible one.
  if (pageCount < min) {
    throw new Error("KDP_PAGE_COUNT_OUT_OF_RANGE:" + pageCount + ":allowed_" + min + "_" + max);
  }
  if (effectivePageCount > max) {
    throw new Error("KDP_PAGE_COUNT_OUT_OF_RANGE:" + effectivePageCount + ":allowed_" + min + "_" + max);
  }
  return effectivePageCount;
}

const EAN_L: Record<string, string> = {
  "0": "0001101", "1": "0011001", "2": "0010011", "3": "0111101", "4": "0100011",
  "5": "0110001", "6": "0101111", "7": "0111011", "8": "0110111", "9": "0001011",
};
const EAN_G: Record<string, string> = {
  "0": "0100111", "1": "0110011", "2": "0011011", "3": "0100001", "4": "0011101",
  "5": "0111001", "6": "0000101", "7": "0010001", "8": "0001001", "9": "0010111",
};
const EAN_R: Record<string, string> = {
  "0": "1110010", "1": "1100110", "2": "1101100", "3": "1000010", "4": "1011100",
  "5": "1001110", "6": "1010000", "7": "1000100", "8": "1001000", "9": "1110100",
};
const EAN_PARITY: Record<string, string> = {
  "0": "LLLLLL", "1": "LLGLGG", "2": "LLGGLG", "3": "LLGGGL", "4": "LGLLGG",
  "5": "LGGLLG", "6": "LGGGLL", "7": "LGLGLG", "8": "LGLGGL", "9": "LGGLGL",
};

function assertFinitePositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`INVALID_${name.toUpperCase()}`);
}

export function computeKdpCoverGeometry(
  pageCount: number,
  trimSize: KdpTrimSize,
  paperType: KdpPaperType,
): KdpCoverGeometry {
  if (!Number.isInteger(pageCount) || pageCount < 1) throw new Error("INVALID_PAGE_COUNT");
  const trim = TRIMS[trimSize];
  if (!trim) throw new Error("INVALID_TRIM_SIZE");
  const perPage = SPINE_PER_PAGE_IN[paperType];
  if (!perPage) throw new Error("INVALID_PAPER_TYPE");
  const effectivePageCount = requireKdpPaperbackPageCount(pageCount, trimSize, paperType);

  const spineWidthIn = effectivePageCount * perPage;
  assertFinitePositive(spineWidthIn, "spine_width");
  const backTrimLeftIn = KDP_BLEED_IN;
  const backTrimRightIn = backTrimLeftIn + trim.width;
  const spineLeftIn = backTrimRightIn;
  const spineRightIn = spineLeftIn + spineWidthIn;
  const frontTrimLeftIn = spineRightIn;
  const frontTrimRightIn = frontTrimLeftIn + trim.width;
  const totalWidthIn = frontTrimRightIn + KDP_BLEED_IN;
  const totalHeightIn = trim.height + (2 * KDP_BLEED_IN);

  // Amazon permits spine text only on sufficiently long books, but text also
  // needs 0.0625" clearance from both folds and at least a 7pt readable font.
  const usableSpinePt = (spineWidthIn - 2 * KDP_SPINE_TEXT_FOLD_CLEARANCE_IN) * PT_PER_IN;
  const spineTextAllowed = effectivePageCount > 79 && usableSpinePt >= 7;

  return {
    sourcePageCount: pageCount,
    effectivePageCount,
    trimWidthIn: trim.width,
    trimHeightIn: trim.height,
    bleedIn: KDP_BLEED_IN,
    spineWidthIn,
    totalWidthIn,
    totalHeightIn,
    backTrimLeftIn,
    backTrimRightIn,
    spineLeftIn,
    spineRightIn,
    frontTrimLeftIn,
    frontTrimRightIn,
    spineTextAllowed,
  };
}

export function buildEan13Bits(value: string): string {
  if (!isValidIsbn13(value)) throw new Error("INVALID_ISBN13");
  const isbn = normalizeIsbn13(value);
  const parity = EAN_PARITY[isbn[0]];
  let left = "";
  for (let i = 1; i <= 6; i += 1) {
    const digit = isbn[i];
    left += parity[i - 1] === "G" ? EAN_G[digit] : EAN_L[digit];
  }
  let right = "";
  for (let i = 7; i <= 12; i += 1) right += EAN_R[isbn[i]];
  const bits = `101${left}01010${right}101`;
  if (bits.length !== 95) throw new Error("EAN13_ENCODING_ERROR");
  return bits;
}

export function barcodeBoxPosition(geometry: KdpCoverGeometry): { xIn: number; yIn: number; widthIn: number; heightIn: number } {
  const xIn = geometry.spineLeftIn - KDP_BARCODE_SPINE_CLEARANCE_IN - KDP_BARCODE_BOX_WIDTH_IN;
  const yIn = KDP_BLEED_IN + KDP_BARCODE_BOTTOM_CLEARANCE_IN;
  if (xIn < geometry.backTrimLeftIn + 0.25) throw new Error("BARCODE_DOES_NOT_FIT_BACK_COVER");
  return { xIn, yIn, widthIn: KDP_BARCODE_BOX_WIDTH_IN, heightIn: KDP_BARCODE_BOX_HEIGHT_IN };
}

function wrapText(text: string, maxChars: number): string[] {
  const words = (text || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) current = candidate;
    else {
      if (current) lines.push(current);
      current = word.length <= maxChars ? word : `${word.slice(0, Math.max(1, maxChars - 1))}…`;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawBarcode(
  page: ReturnType<PDFDocument["addPage"]>,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  isbn: string,
  box: { xIn: number; yIn: number; widthIn: number; heightIn: number },
): void {
  const x = box.xIn * PT_PER_IN;
  const y = box.yIn * PT_PER_IN;
  const w = box.widthIn * PT_PER_IN;
  const h = box.heightIn * PT_PER_IN;
  page.drawRectangle({ x, y, width: w, height: h, color: rgb(1, 1, 1) });

  const bits = buildEan13Bits(isbn);
  const quietModules = 11;
  const totalModules = bits.length + quietModules * 2;
  const moduleWidth = (w - 8) / totalModules;
  const barsBottom = y + 18;
  const barsTop = y + h - 8;
  const normalHeight = barsTop - barsBottom;
  const guardExtra = 5;
  let cursor = x + 4 + quietModules * moduleWidth;
  for (let i = 0; i < bits.length; i += 1) {
    if (bits[i] === "1") {
      const guard = i < 3 || (i >= 45 && i < 50) || i >= 92;
      page.drawRectangle({
        x: cursor,
        y: guard ? barsBottom - guardExtra : barsBottom,
        width: Math.max(0.6, moduleWidth),
        height: normalHeight + (guard ? guardExtra : 0),
        color: rgb(0, 0, 0),
      });
    }
    cursor += moduleWidth;
  }
  const label = `ISBN ${isbn.slice(0, 3)}-${isbn.slice(3, 4)}-${isbn.slice(4, 9)}-${isbn.slice(9, 12)}-${isbn.slice(12)}`;
  const fontSize = 7;
  const tw = font.widthOfTextAtSize(label, fontSize);
  page.drawText(label, { x: x + (w - tw) / 2, y: y + 5, size: fontSize, font, color: rgb(0, 0, 0) });
}

async function embedFrontImage(pdf: PDFDocument, bytes: Uint8Array, mime: string) {
  const normalized = mime.toLowerCase().split(";")[0].trim();
  if (normalized === "image/jpeg" || normalized === "image/jpg") return await pdf.embedJpg(bytes);
  if (normalized === "image/png") return await pdf.embedPng(bytes);
  throw new Error("UNSUPPORTED_PRINT_COVER_MIME");
}

export async function getPdfPageCount(bytes: Uint8Array): Promise<number> {
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: false });
  return pdf.getPageCount();
}

export async function buildKdpPrintCoverPdf(input: KdpPrintCoverInput): Promise<KdpPrintCoverResult> {
  if (!input.title?.trim()) throw new Error("TITLE_REQUIRED");
  if (input.frontCoverBytes.byteLength < 64) throw new Error("COVER_IMAGE_TOO_SMALL");
  const geometry = computeKdpCoverGeometry(input.pageCount, input.trimSize, input.paperType);
  const isbn = input.isbn13 ? normalizeIsbn13(input.isbn13) : null;
  if (input.barcodeMode === "owned_isbn" && (!isbn || !isValidIsbn13(isbn))) throw new Error("VALID_PAPERBACK_ISBN_REQUIRED");
  if (input.barcodeMode === "kdp_assigned" && isbn) throw new Error("KDP_ASSIGNED_BARCODE_MUST_NOT_CARRY_ISBN");

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([geometry.totalWidthIn * PT_PER_IN, geometry.totalHeightIn * PT_PER_IN]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const frontImage = await embedFrontImage(pdf, input.frontCoverBytes, input.frontCoverMime);

  // Draw the front artwork first using a cover-fit. Any leftward overflow is
  // subsequently masked by the spine/back panels, producing a clean full-bleed front.
  const frontX = geometry.frontTrimLeftIn * PT_PER_IN;
  const targetW = (geometry.trimWidthIn + KDP_BLEED_IN) * PT_PER_IN;
  const targetH = geometry.totalHeightIn * PT_PER_IN;
  const scale = Math.max(targetW / frontImage.width, targetH / frontImage.height);
  const drawW = frontImage.width * scale;
  const drawH = frontImage.height * scale;
  page.drawImage(frontImage, {
    x: frontX + (targetW - drawW) / 2,
    y: (targetH - drawH) / 2,
    width: drawW,
    height: drawH,
  });

  // Back and spine are deterministic, print-safe panels. They also mask any
  // crop overflow from the front-cover artwork.
  page.drawRectangle({
    x: 0,
    y: 0,
    width: geometry.spineLeftIn * PT_PER_IN,
    height: geometry.totalHeightIn * PT_PER_IN,
    color: rgb(0.975, 0.972, 0.96),
  });
  page.drawRectangle({
    x: geometry.spineLeftIn * PT_PER_IN,
    y: 0,
    width: geometry.spineWidthIn * PT_PER_IN,
    height: geometry.totalHeightIn * PT_PER_IN,
    color: rgb(0.08, 0.08, 0.08),
  });

  const safeLeft = (geometry.backTrimLeftIn + 0.25) * PT_PER_IN;
  const safeRight = (geometry.spineLeftIn - 0.25) * PT_PER_IN;
  const textWidth = safeRight - safeLeft;
  const top = (geometry.totalHeightIn - KDP_BLEED_IN - 0.35) * PT_PER_IN;

  const titleSize = 16;
  const titleLines = wrapText(input.title, Math.max(20, Math.floor(textWidth / 8.5))).slice(0, 3);
  let textY = top;
  for (const line of titleLines) {
    page.drawText(line, { x: safeLeft, y: textY, size: titleSize, font: bold, color: rgb(0.08, 0.08, 0.08) });
    textY -= 20;
  }
  if (input.authorName?.trim()) {
    page.drawText(input.authorName.trim(), { x: safeLeft, y: textY - 2, size: 10, font: regular, color: rgb(0.25, 0.25, 0.25) });
    textY -= 26;
  }

  const barcodeBox = barcodeBoxPosition(geometry);
  const barcodeTopPt = (barcodeBox.yIn + barcodeBox.heightIn) * PT_PER_IN;
  const blurbFloor = barcodeTopPt + 22;
  const blurb = (input.backBlurb || "").trim();
  if (blurb) {
    const blurbLines = wrapText(blurb, Math.max(30, Math.floor(textWidth / 5.4)));
    const maxLines = Math.max(0, Math.floor((textY - blurbFloor) / 11));
    for (const [index, line] of blurbLines.slice(0, maxLines).entries()) {
      const suffix = index === maxLines - 1 && blurbLines.length > maxLines ? "…" : "";
      page.drawText(`${line}${suffix}`, { x: safeLeft, y: textY - index * 11, size: 8.5, font: regular, color: rgb(0.16, 0.16, 0.16) });
    }
  }

  const imprintLine = [input.imprintName, input.publisherName].filter(Boolean).join(" · ");
  if (imprintLine) {
    page.drawText(imprintLine.slice(0, 100), {
      x: safeLeft,
      y: (KDP_BLEED_IN + 0.28) * PT_PER_IN,
      size: 7.5,
      font: regular,
      color: rgb(0.28, 0.28, 0.28),
    });
  }

  if (input.barcodeMode === "owned_isbn" && isbn) {
    drawBarcode(page, regular, isbn, barcodeBox);
  } else {
    // KDP will place its own ISBN barcode. Reserve the exact lower-back area
    // instead of drawing a synthetic identifier.
    page.drawRectangle({
      x: barcodeBox.xIn * PT_PER_IN,
      y: barcodeBox.yIn * PT_PER_IN,
      width: barcodeBox.widthIn * PT_PER_IN,
      height: barcodeBox.heightIn * PT_PER_IN,
      color: rgb(1, 1, 1),
      borderColor: rgb(0.82, 0.82, 0.82),
      borderWidth: 0.5,
    });
  }

  let spineTextRendered = false;
  if (geometry.spineTextAllowed) {
    const usableSpinePt = (geometry.spineWidthIn - 2 * KDP_SPINE_TEXT_FOLD_CLEARANCE_IN) * PT_PER_IN;
    const spineFontSize = Math.min(12, Math.max(7, usableSpinePt));
    const spineLabel = [input.title.trim(), input.authorName?.trim()].filter(Boolean).join(" — ");
    const maxTextWidth = (geometry.trimHeightIn - 0.75) * PT_PER_IN;
    let label = spineLabel;
    while (label.length > 8 && bold.widthOfTextAtSize(label, spineFontSize) > maxTextWidth) label = `${label.slice(0, -2)}…`;
    const textWidthPt = bold.widthOfTextAtSize(label, spineFontSize);
    const spineCenterX = ((geometry.spineLeftIn + geometry.spineRightIn) / 2) * PT_PER_IN;
    page.drawText(label, {
      x: spineCenterX + spineFontSize * 0.32,
      y: (geometry.totalHeightIn * PT_PER_IN - textWidthPt) / 2,
      size: spineFontSize,
      font: bold,
      rotate: degrees(90),
      color: rgb(1, 1, 1),
    });
    spineTextRendered = true;
  }

  const bytes = await pdf.save({ useObjectStreams: false });
  return { bytes, geometry, barcodeMode: input.barcodeMode, isbn13: isbn, spineTextRendered };
}
