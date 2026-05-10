/**
 * ScrollVision — evidence-grounded media client
 * ----------------------------------------------
 * Real images from open archives (Wikimedia Commons, Met Museum) with
 * full provenance & licensing. AI-generated visuals remain a fallback.
 */
import { supabase } from "@/integrations/supabase/client";

export interface ScrollVisionAsset {
  id: string;
  source: string;
  source_url: string;
  image_url: string;
  thumbnail_url: string | null;
  title: string | null;
  description: string | null;
  license: string | null;
  attribution: string | null;
  entity: string | null;
  width: number | null;
  height: number | null;
}

export interface ChapterAsset extends ScrollVisionAsset {
  placement_order: number;
  caption: string | null;
}

export async function retrieveChapterEvidence(input: {
  bookId: string;
  chapterId: string;
  title?: string;
  content?: string;
  entities?: string[];
  maxAssets?: number;
}) {
  const { data, error } = await supabase.functions.invoke("scrollvision-retrieve", {
    body: input,
  });
  if (error) throw error;
  return data as {
    success: boolean;
    entities: string[];
    candidates: number;
    linked: number;
    assets: Array<{ id: string; entity: string }>;
  };
}

export async function getChapterEvidenceAssets(chapterId: string): Promise<ChapterAsset[]> {
  const { data, error } = await supabase
    .from("scrollvision_chapter_assets")
    .select(
      `placement_order, caption, scrollvision_assets!inner (
        id, source, source_url, image_url, thumbnail_url, title, description,
        license, attribution, entity, width, height
      )`,
    )
    .eq("chapter_id", chapterId)
    .eq("is_active", true)
    .order("placement_order", { ascending: true });

  if (error) {
    console.warn("[scrollvision] fetch error", error);
    return [];
  }

  return (data ?? []).map((row: any) => ({
    ...row.scrollvision_assets,
    placement_order: row.placement_order,
    caption: row.caption,
  }));
}
