// AI Publishing Art Director — client wrapper
import { supabase } from "@/integrations/supabase/client";

export type ArtDirectorCategory =
  | "executive_photo"
  | "infographic"
  | "chart"
  | "map"
  | "timeline"
  | "architecture"
  | "conceptual";

export interface ArtDirectorRecommendation {
  category: ArtDirectorCategory;
  reason: string;
  caption: string;
  alt_text: string;
  prompt: string;
  alternative_prompts: string[];
  placement_anchor: string | null;
  suggested_section_title: string | null;
  source: "ai_generated";
}

export interface ArtDirectorAnalysis {
  recommendations: ArtDirectorRecommendation[];
  skipped_reason: string | null;
}

export interface AnalyzeInput {
  chapterContent: string;
  bookType?: string;
  bookTitle?: string;
  chapterTitle?: string;
  category?: string;
  language?: string;
}

export async function analyzeChapterVisuals(input: AnalyzeInput): Promise<ArtDirectorAnalysis> {
  const { data, error } = await supabase.functions.invoke("art-director-analyze", {
    body: input,
  });
  if (error) {
    // Surface gateway errors clearly; never throw silently
    const msg = (error as any)?.message || "Art Director analysis failed";
    throw new Error(msg);
  }
  return data as ArtDirectorAnalysis;
}

export interface PreviewVisualInput {
  recommendation: ArtDirectorRecommendation;
  promptOverride?: string;
  bookType?: string;
  chapterTitle?: string;
  category?: string;
}

export interface PreviewVisualResult {
  imageUrl: string;
}

export async function previewRecommendation(
  input: PreviewVisualInput,
): Promise<PreviewVisualResult> {
  const { recommendation, promptOverride, bookType, chapterTitle, category } = input;
  const { data, error } = await supabase.functions.invoke("generate-image", {
    body: {
      prompt: promptOverride || recommendation.prompt,
      // map Art Director category onto the legacy book-type-aware art direction
      style: recommendation.category === "executive_photo" ? "realistic" : "illustration",
      bookType,
      chapterTitle,
      category,
      isPremium: false,
    },
  });
  if (error) {
    const msg = (error as any)?.message || "Image preview failed";
    throw new Error(msg);
  }
  if (!data?.imageUrl) throw new Error("No image returned");
  return { imageUrl: data.imageUrl };
}

/**
 * Build the markdown block to insert into the chapter once the user accepts a preview.
 * Stores clean metadata in an HTML comment so export pipelines can read it later
 * WITHOUT exposing prompt/process language to readers.
 */
export function buildVisualInsertBlock(args: {
  recommendation: ArtDirectorRecommendation;
  imageUrl: string;
  assetId?: string;
}): string {
  const { recommendation, imageUrl, assetId } = args;
  const meta = {
    category: recommendation.category,
    source: recommendation.source,
    placement_anchor: recommendation.placement_anchor,
    alt_text: recommendation.alt_text,
    caption: recommendation.caption,
    asset_id: assetId ?? null,
  };
  // Image, caption as italic line, hidden metadata comment for export
  return [
    "",
    `![${recommendation.alt_text}](${imageUrl})`,
    `*${recommendation.caption}*`,
    `<!-- art-director:${JSON.stringify(meta)} -->`,
    "",
  ].join("\n");
}

/**
 * Insert the block at the recommendation's anchor; if anchor not found,
 * append at end so the author can manually relocate.
 */
export function insertVisualIntoContent(
  content: string,
  block: string,
  anchor: string | null,
): { content: string; insertedAtAnchor: boolean } {
  if (anchor && content.includes(anchor)) {
    const idx = content.indexOf(anchor);
    // Insert after the paragraph containing the anchor (next blank line)
    const after = content.indexOf("\n\n", idx);
    const insertAt = after === -1 ? content.length : after;
    const next = content.slice(0, insertAt) + "\n" + block + content.slice(insertAt);
    return { content: next, insertedAtAnchor: true };
  }
  return { content: content + "\n" + block, insertedAtAnchor: false };
}

export const CATEGORY_LABEL: Record<ArtDirectorCategory, string> = {
  executive_photo: "Executive Photography",
  infographic: "Business Infographic",
  chart: "Executive Chart",
  map: "Map",
  timeline: "Timeline",
  architecture: "Architecture Diagram",
  conceptual: "Conceptual Graphic",
};
