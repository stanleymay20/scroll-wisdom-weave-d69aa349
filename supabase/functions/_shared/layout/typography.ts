// Typography tokens for the layout engine.
// Sourced from publisherDesign.ts at the call site; defaults here mirror the
// "Editorial" preset (Spectral 11/15) on US Trade trim (6x9, 0.75" margins).

export interface TypographyTokens {
  trimWidthPt: number;
  trimHeightPt: number;
  marginTopPt: number;
  marginBottomPt: number;
  marginInsidePt: number;
  marginOutsidePt: number;
  bodyFontSizePt: number;
  bodyLeadingPt: number;
  bodyAvgCharWidthPt: number; // for line-width estimation
  h1SizePt: number;
  h2SizePt: number;
  h3SizePt: number;
  paragraphSpacingPt: number;
  widowMinLines: number;
  orphanMinLines: number;
  headingMinFollowingLines: number;
}

export const DEFAULT_TYPOGRAPHY: TypographyTokens = {
  trimWidthPt: 6 * 72,
  trimHeightPt: 9 * 72,
  marginTopPt: 0.75 * 72,
  marginBottomPt: 0.75 * 72,
  marginInsidePt: 0.75 * 72,
  marginOutsidePt: 0.6 * 72,
  bodyFontSizePt: 11,
  bodyLeadingPt: 15,
  bodyAvgCharWidthPt: 5.2,
  h1SizePt: 28,
  h2SizePt: 18,
  h3SizePt: 14,
  paragraphSpacingPt: 6,
  widowMinLines: 2,
  orphanMinLines: 2,
  headingMinFollowingLines: 3,
};

export function contentWidthPt(t: TypographyTokens): number {
  return t.trimWidthPt - t.marginInsidePt - t.marginOutsidePt;
}
export function contentHeightPt(t: TypographyTokens): number {
  return t.trimHeightPt - t.marginTopPt - t.marginBottomPt;
}
