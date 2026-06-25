// Phase 2.1 — Publisher Design System (client mirror of edge module).
// Keep in sync with supabase/functions/_shared/publisherDesign.ts.

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
  accent_color: string;
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

export const PRESETS: Record<DesignPreset, Partial<DesignSettings>> = {
  editorial: { font_pair: "spectral_inter", accent_color: "#1d4ed8", header_style: "title_chapter" },
  academic: { font_pair: "lora_inter", accent_color: "#7c2d12", header_style: "chapter_only" },
  modern: { font_pair: "playfair_source", accent_color: "#0f766e", header_style: "minimal" },
};

export const FONT_PAIR_LABELS: Record<FontPair, string> = {
  spectral_inter: "Spectral + Inter",
  lora_inter: "Lora + Inter",
  playfair_source: "Playfair + Source Serif",
};

export const TRIM_LABELS: Record<TrimSize, string> = {
  us_letter: "US Letter (8.5×11)",
  a5: "A5",
  trade_6x9: "Trade 6×9",
};

export const CITATION_STYLE_LABELS: Record<CitationStyle, string> = {
  apa: "APA 7",
  chicago: "Chicago",
  harvard: "Harvard",
  ieee: "IEEE",
};

export function resolveDesign(input: Partial<DesignSettings> | null | undefined): DesignSettings {
  if (!input) return { ...DEFAULT_DESIGN_SETTINGS };
  return { ...DEFAULT_DESIGN_SETTINGS, ...input };
}
