/**
 * Amazon KDP paperback structural print rules.
 *
 * This module is intentionally narrow: it centralizes the numeric rules that
 * ScrollLibrary can verify deterministically today (page geometry, supported
 * print profiles, page-count ranges and minimum margins). It is NOT a full KDP
 * compliance model and must not be used to imply checks for fonts, image DPI,
 * color spaces, safe areas, PDF/X, annotations, printer marks or layers.
 *
 * Amazon references re-verified 2026-09-08:
 * - https://kdp.amazon.com/en_US/help/topic/G201834180
 * - https://kdp.amazon.com/en_US/help/topic/GVBQ3CMEQW3W2VL6
 * - https://kdp.amazon.com/en_US/help/topic/G201857950
 */

export const KDP_STRUCTURAL_RULESET_VERSION = "kdp-structural-v1" as const;
export const PT_PER_IN = 72;
export const KDP_BLEED_WIDTH_IN = 0.125;
export const KDP_BLEED_HEIGHT_IN = 0.25;

export type KdpTrimSize = "5x8" | "5.25x8" | "5.5x8.5" | "6x9" | "7x10" | "8.5x11";
export type KdpPaperType = "white" | "cream" | "groundwood" | "standard_color" | "premium_color";
export type KdpInk = "black" | "standard_color" | "premium_color";
export type KdpPaper = "white" | "cream" | "groundwood";

export type KdpPrintProfileId =
  | "black_white"
  | "black_cream"
  | "black_groundwood"
  | "standard_color_white"
  | "premium_color_white";

export interface KdpPrintProfile {
  id: KdpPrintProfileId;
  label: string;
  ink: KdpInk;
  paper: KdpPaper;
  paperType: KdpPaperType;
}

export const KDP_PRINT_PROFILES: Record<KdpPrintProfileId, KdpPrintProfile> = {
  black_white: { id: "black_white", label: "Black ink · white paper", ink: "black", paper: "white", paperType: "white" },
  black_cream: { id: "black_cream", label: "Black ink · cream paper", ink: "black", paper: "cream", paperType: "cream" },
  black_groundwood: { id: "black_groundwood", label: "Black ink · groundwood paper", ink: "black", paper: "groundwood", paperType: "groundwood" },
  standard_color_white: { id: "standard_color_white", label: "Standard color · white paper", ink: "standard_color", paper: "white", paperType: "standard_color" },
  premium_color_white: { id: "premium_color_white", label: "Premium color · white paper", ink: "premium_color", paper: "white", paperType: "premium_color" },
};

export const KDP_PRINT_PROFILE_IDS = Object.keys(KDP_PRINT_PROFILES) as KdpPrintProfileId[];
export const DEFAULT_KDP_PRINT_PROFILE: KdpPrintProfileId = "black_white";

export function isKdpPrintProfileId(value: unknown): value is KdpPrintProfileId {
  return typeof value === "string" && value in KDP_PRINT_PROFILES;
}

export function resolveKdpPrintProfile(value: unknown): KdpPrintProfile {
  if (value === undefined || value === null || value === "") return KDP_PRINT_PROFILES[DEFAULT_KDP_PRINT_PROFILE];
  if (!isKdpPrintProfileId(value)) throw new Error(`INVALID_KDP_PRINT_PROFILE:${String(value)}`);
  return KDP_PRINT_PROFILES[value];
}

export const KDP_TRIM_SIZES_IN: Record<KdpTrimSize, { width: number; height: number }> = {
  "5x8": { width: 5, height: 8 },
  "5.25x8": { width: 5.25, height: 8 },
  "5.5x8.5": { width: 5.5, height: 8.5 },
  "6x9": { width: 6, height: 9 },
  "7x10": { width: 7, height: 10 },
  "8.5x11": { width: 8.5, height: 11 },
};

export const KDP_TRIM_SIZE_IDS = Object.keys(KDP_TRIM_SIZES_IN) as KdpTrimSize[];

export function isKdpTrimSize(value: unknown): value is KdpTrimSize {
  return typeof value === "string" && value in KDP_TRIM_SIZES_IN;
}

/** Exact final interior PDF page size for the selected trim and bleed mode. */
export function kdpExpectedPageSizePt(trimSize: KdpTrimSize, bleed: boolean): { widthPt: number; heightPt: number } {
  const trim = KDP_TRIM_SIZES_IN[trimSize];
  if (!trim) throw new Error("INVALID_KDP_TRIM_SIZE");
  return {
    widthPt: (trim.width + (bleed ? KDP_BLEED_WIDTH_IN : 0)) * PT_PER_IN,
    heightPt: (trim.height + (bleed ? KDP_BLEED_HEIGHT_IN : 0)) * PT_PER_IN,
  };
}

// Current KDP paperback page-count ranges. 5x8 through 7x10 use the default
// table; 8.5x11 has lower maxima for several paper types.
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

export function getKdpPaperbackPageLimits(trimSize: KdpTrimSize, paperType: KdpPaperType): { min: number; max: number } {
  if (!KDP_TRIM_SIZES_IN[trimSize]) throw new Error("INVALID_KDP_TRIM_SIZE");
  const table = trimSize === "8.5x11" ? PAGE_LIMITS_8_5_X_11 : PAGE_LIMITS_DEFAULT;
  const limit = table[paperType];
  if (!limit) throw new Error("INVALID_KDP_PRINT_COMBINATION");
  return { ...limit };
}

export interface KdpPageCountCheck {
  ok: boolean;
  pageCount: number;
  min: number;
  max: number;
  reason?: "below_minimum" | "above_maximum";
}

export function checkKdpPageCount(pageCount: number, trimSize: KdpTrimSize, paperType: KdpPaperType): KdpPageCountCheck {
  const { min, max } = getKdpPaperbackPageLimits(trimSize, paperType);
  if (!Number.isInteger(pageCount) || pageCount < min) return { ok: false, pageCount, min, max, reason: "below_minimum" };
  if (pageCount > max) return { ok: false, pageCount, min, max, reason: "above_maximum" };
  return { ok: true, pageCount, min, max };
}

export interface KdpInteriorMarginsIn {
  inside: number;
  outside: number;
  top: number;
  bottom: number;
}

/**
 * Current Amazon minimum interior margins in inches.
 * The 701+ branch is safe for calculating the minimum gutter before the
 * separate page-count gate rejects an artifact above its selected profile's
 * maximum.
 */
export function getKdpMinimumInteriorMarginsIn(pageCount: number, bleed: boolean): KdpInteriorMarginsIn {
  let inside = 0.375;
  if (pageCount > 150 && pageCount <= 300) inside = 0.5;
  else if (pageCount > 300 && pageCount <= 500) inside = 0.625;
  else if (pageCount > 500 && pageCount <= 700) inside = 0.75;
  else if (pageCount > 700) inside = 0.875;
  const edge = bleed ? 0.375 : 0.25;
  return { inside, outside: edge, top: edge, bottom: edge };
}

export function getKdpMinimumInteriorMarginsPt(pageCount: number, bleed: boolean): KdpInteriorMarginsIn {
  const m = getKdpMinimumInteriorMarginsIn(pageCount, bleed);
  return {
    inside: m.inside * PT_PER_IN,
    outside: m.outside * PT_PER_IN,
    top: m.top * PT_PER_IN,
    bottom: m.bottom * PT_PER_IN,
  };
}
