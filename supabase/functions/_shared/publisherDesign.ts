// Phase 2.1 — Publisher Design System: shared design tokens.
// Consumed by export-publication, generate-publication-certificate,
// and any future renderer. Keep in sync with src/lib/publisherDesign.ts.

export type FontPair = "spectral_inter" | "lora_inter" | "playfair_source";
export type TrimSize = "us_letter" | "a5" | "trade_6x9";
export type HeaderStyle = "title_chapter" | "chapter_only" | "minimal";
export type FooterStyle = "page_center" | "page_outer" | "none";
export type CitationStyle = "apa" | "chicago" | "harvard" | "ieee";
export type DesignPreset = "editorial" | "academic" | "modern";

export interface DesignSettings {
  preset: DesignPreset;
  font_pair: FontPair;
  trim_size: TrimSize;
  accent_color: string; // hex
  header_style: HeaderStyle;
  footer_style: FooterStyle;
  endnotes_per_chapter: boolean;
  citation_style: CitationStyle;
}

export const DEFAULT_DESIGN_SETTINGS: DesignSettings = {
  preset: "editorial",
  font_pair: "spectral_inter",
  trim_size: "us_letter",
  accent_color: "#1d4ed8",
  header_style: "title_chapter",
  footer_style: "page_center",
  endnotes_per_chapter: false,
  citation_style: "apa",
};

export const FONT_PAIRS: Record<FontPair, { display: string; body: string; sans: string }> = {
  spectral_inter: { display: "Spectral", body: "Spectral", sans: "Inter" },
  lora_inter: { display: "Lora", body: "Lora", sans: "Inter" },
  playfair_source: { display: "Playfair Display", body: "Source Serif Pro", sans: "Source Sans Pro" },
};

export const TRIM_SIZES: Record<TrimSize, { width: number; height: number; label: string }> = {
  // points (1pt = 1/72 inch)
  us_letter: { width: 612, height: 792, label: "US Letter (8.5×11)" },
  a5: { width: 419.53, height: 595.28, label: "A5" },
  trade_6x9: { width: 432, height: 648, label: "Trade 6×9" },
};

export const TYPE_SCALE = {
  display: 36,
  h1: 26,
  h2: 18,
  h3: 14,
  body: 11,
  caption: 9,
  footer: 9,
};

export const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };

export const COLORS = {
  ink: "#111111",
  muted: "#666666",
  rule: "#999999",
  paper: "#ffffff",
};

export function resolveDesign(input: Partial<DesignSettings> | null | undefined): DesignSettings {
  if (!input) return { ...DEFAULT_DESIGN_SETTINGS };
  return { ...DEFAULT_DESIGN_SETTINGS, ...input };
}
