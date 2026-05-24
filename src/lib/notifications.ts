/**
 * notifications — client helpers for creator_notifications.
 * Users can list / mark read / delete their own; RLS enforces ownership.
 */
import { supabase } from "@/integrations/supabase/client";

export type NotificationKind =
  | "new_release"
  | "followed_author_release"
  | "collection_update"
  | "recommendation_digest"
  | "continue_reading"
  | "publish_status"
  | "system";

export interface AppNotification {
  id: string;
  user_id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  link_url: string | null;
  resource_type: string | null;
  resource_id: string | null;
  read_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export async function listNotifications(limit = 30) {
  const { data, error } = await supabase
    .from("creator_notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as AppNotification[];
}

export async function countUnread(): Promise<number> {
  const { count, error } = await supabase
    .from("creator_notifications")
    .select("*", { count: "exact", head: true })
    .is("read_at", null);
  if (error) return 0;
  return count ?? 0;
}

export async function markRead(id: string) {
  const { error } = await supabase
    .from("creator_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function markAllRead() {
  const { error } = await supabase
    .from("creator_notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
  if (error) throw error;
}

export async function deleteNotification(id: string) {
  const { error } = await supabase.from("creator_notifications").delete().eq("id", id);
  if (error) throw error;
}
