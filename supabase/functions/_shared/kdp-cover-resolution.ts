export type KdpResolutionTrim = "5x8" | "5.25x8" | "5.5x8.5" | "6x9" | "7x10" | "8.5x11";

const BLEED_IN = 0.125;
const TRIMS: Record<KdpResolutionTrim, { width: number; height: number }> = {
  "5x8": { width: 5, height: 8 },
  "5.25x8": { width: 5.25, height: 8 },
  "5.5x8.5": { width: 5.5, height: 8.5 },
  "6x9": { width: 6, height: 9 },
  "7x10": { width: 7, height: 10 },
  "8.5x11": { width: 8.5, height: 11 },
};

export interface KdpCoverResolutionAssessment {
  widthPx: number;
  heightPx: number;
  requiredWidthPx: number;
  requiredHeightPx: number;
  widthDpi: number;
  heightDpi: number;
  effectiveDpi: number;
  minimumDpi: number;
  passes: boolean;
}

export function assessKdpFrontCoverResolution(
  widthPx: number,
  heightPx: number,
  trim: KdpResolutionTrim,
  minimumDpi = 300,
): KdpCoverResolutionAssessment {
  if (!Number.isFinite(widthPx) || !Number.isFinite(heightPx) || widthPx < 1 || heightPx < 1) {
    throw new Error("KDP_COVER_DIMENSIONS_UNKNOWN");
  }
  if (!Number.isFinite(minimumDpi) || minimumDpi < 72) throw new Error("INVALID_MINIMUM_DPI");
  const size = TRIMS[trim];
  if (!size) throw new Error("INVALID_KDP_TRIM_SIZE");

  // Front art must cover the front trim plus the outside bleed and both
  // vertical bleeds. The spine edge is not an outside trim edge.
  const physicalWidthIn = size.width + BLEED_IN;
  const physicalHeightIn = size.height + (2 * BLEED_IN);
  const requiredWidthPx = Math.ceil(physicalWidthIn * minimumDpi);
  const requiredHeightPx = Math.ceil(physicalHeightIn * minimumDpi);
  const widthDpi = widthPx / physicalWidthIn;
  const heightDpi = heightPx / physicalHeightIn;
  const effectiveDpi = Math.min(widthDpi, heightDpi);

  return {
    widthPx,
    heightPx,
    requiredWidthPx,
    requiredHeightPx,
    widthDpi,
    heightDpi,
    effectiveDpi,
    minimumDpi,
    passes: widthPx >= requiredWidthPx && heightPx >= requiredHeightPx,
  };
}

export function requireKdpFrontCoverResolution(
  widthPx: number | null | undefined,
  heightPx: number | null | undefined,
  trim: KdpResolutionTrim,
  minimumDpi = 300,
): KdpCoverResolutionAssessment {
  if (widthPx == null || heightPx == null) throw new Error("KDP_COVER_DIMENSIONS_UNKNOWN");
  const assessment = assessKdpFrontCoverResolution(widthPx, heightPx, trim, minimumDpi);
  if (!assessment.passes) {
    throw new Error(
      `KDP_COVER_RESOLUTION_BELOW_${minimumDpi}_DPI:${assessment.widthPx}x${assessment.heightPx}:required_${assessment.requiredWidthPx}x${assessment.requiredHeightPx}`,
    );
  }
  return assessment;
}
