/**
 * releaseSchedules — client helpers for serialized publishing.
 * Owners can create/manage schedules and items; RLS enforces ownership.
 */
import { supabase } from "@/integrations/supabase/client";

export type Cadence = "daily" | "weekly" | "biweekly" | "monthly" | "manual";
export type Channel = "platform" | "substack" | "patreon" | "email" | "rss";

export interface ReleaseSchedule {
  id: string;
  book_id: string;
  owner_user_id: string;
  cadence: Cadence;
  start_at: string;
  channel: Channel;
  early_access_tier: string | null;
  status: "draft" | "active" | "paused" | "completed" | "cancelled";
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ReleaseScheduleItem {
  id: string;
  schedule_id: string;
  chapter_id: string | null;
  chapter_number: number | null;
  release_at: string;
  status: "scheduled" | "released" | "skipped" | "failed";
  released_at: string | null;
  error_message: string | null;
}

const CADENCE_DAYS: Record<Cadence, number> = {
  daily: 1, weekly: 7, biweekly: 14, monthly: 30, manual: 0,
};

export async function fetchScheduleForBook(bookId: string) {
  const { data, error } = await supabase
    .from("release_schedules")
    .select("*")
    .eq("book_id", bookId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as ReleaseSchedule | null;
}

export async function fetchScheduleItems(scheduleId: string) {
  const { data, error } = await supabase
    .from("release_schedule_items")
    .select("*")
    .eq("schedule_id", scheduleId)
    .order("release_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ReleaseScheduleItem[];
}

export async function createSchedule(input: {
  book_id: string;
  owner_user_id: string;
  cadence: Cadence;
  start_at: string;
  channel: Channel;
  early_access_tier?: string | null;
}) {
  const { data, error } = await supabase
    .from("release_schedules")
    .insert(input)
    .select("*")
    .single();
  if (error) throw error;
  return data as ReleaseSchedule;
}

export async function updateSchedule(id: string, patch: Partial<ReleaseSchedule>) {
  const { data, error } = await supabase
    .from("release_schedules")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as ReleaseSchedule;
}

export async function deleteSchedule(id: string) {
  const { error } = await supabase.from("release_schedules").delete().eq("id", id);
  if (error) throw error;
}

/** Generate a series of release items from a list of chapters, given cadence/start. */
export async function generateScheduleItems(
  scheduleId: string,
  chapters: { id: string; chapter_number: number }[],
  cadence: Cadence,
  startAt: Date,
) {
  if (cadence === "manual") return [];
  const stepDays = CADENCE_DAYS[cadence];
  const rows = chapters.map((c, i) => {
    const t = new Date(startAt);
    t.setUTCDate(t.getUTCDate() + i * stepDays);
    return {
      schedule_id: scheduleId,
      chapter_id: c.id,
      chapter_number: c.chapter_number,
      release_at: t.toISOString(),
      status: "scheduled" as const,
    };
  });
  if (!rows.length) return [];
  const { data, error } = await supabase
    .from("release_schedule_items")
    .insert(rows)
    .select("*");
  if (error) throw error;
  return data as ReleaseScheduleItem[];
}

export async function clearScheduleItems(scheduleId: string) {
  const { error } = await supabase
    .from("release_schedule_items")
    .delete()
    .eq("schedule_id", scheduleId);
  if (error) throw error;
}
