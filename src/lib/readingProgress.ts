// Reading progress: per-user/book resume state. RLS enforces ownership.
// Source: sample | full | owned (used to respect access boundaries).
import { supabase } from "@/integrations/supabase/client";

export interface ReadingProgressRow {
  id: string;
  user_id: string;
  book_id: string;
  chapter_id: string | null;
  percent: number;
  source: "sample" | "full" | "owned";
  last_read_at: string;
}

export async function saveReadingProgress(opts: {
  book_id: string;
  chapter_id?: string | null;
  percent: number;
  source?: "sample" | "full" | "owned";
}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const percent = Math.max(0, Math.min(100, Number(opts.percent) || 0));
  try {
    await supabase.from("reading_progress").upsert(
      {
        user_id: user.id,
        book_id: opts.book_id,
        chapter_id: opts.chapter_id ?? null,
        percent,
        source: opts.source ?? "sample",
        last_read_at: new Date().toISOString(),
      },
      { onConflict: "user_id,book_id" },
    );
  } catch { /* swallow */ }
}

export async function getReadingProgress(book_id: string): Promise<ReadingProgressRow | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("reading_progress")
    .select("*")
    .eq("user_id", user.id)
    .eq("book_id", book_id)
    .maybeSingle();
  return (data as ReadingProgressRow) ?? null;
}

export async function listContinueReading(limit = 8): Promise<ReadingProgressRow[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("reading_progress")
    .select("*")
    .eq("user_id", user.id)
    .lt("percent", 100)
    .order("last_read_at", { ascending: false })
    .limit(limit);
  return (data as ReadingProgressRow[]) ?? [];
}
