// Follow / unfollow an author. RLS allows users to insert/delete their own follow.
import { supabase } from "@/integrations/supabase/client";
import { logRecommendationEvent } from "./recommendationFeedback";

export async function getFollowerCount(authorUserId: string): Promise<number> {
  const { count } = await supabase
    .from("author_followers")
    .select("id", { head: true, count: "exact" })
    .eq("author_user_id", authorUserId);
  return count ?? 0;
}

export async function isFollowing(authorUserId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from("author_followers")
    .select("id")
    .eq("author_user_id", authorUserId)
    .eq("follower_user_id", user.id)
    .maybeSingle();
  return !!data;
}

export async function followAuthor(authorUserId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_authenticated" };
  if (user.id === authorUserId) return { ok: false, error: "cannot_follow_self" };
  const { error } = await supabase
    .from("author_followers")
    .insert({ follower_user_id: user.id, author_user_id: authorUserId });
  if (error && !error.message.includes("duplicate")) return { ok: false, error: error.message };
  try {
    await logRecommendationEvent({
      source: "author_profile", action: "clicked",
      metadata: { kind: "author_follow", author_user_id: authorUserId },
    });
  } catch { /* noop */ }
  return { ok: true };
}

export async function unfollowAuthor(authorUserId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_authenticated" };
  const { error } = await supabase
    .from("author_followers")
    .delete()
    .eq("follower_user_id", user.id)
    .eq("author_user_id", authorUserId);
  if (error) return { ok: false, error: error.message };
  try {
    await logRecommendationEvent({
      source: "author_profile", action: "hidden",
      metadata: { kind: "author_unfollow", author_user_id: authorUserId },
    });
  } catch { /* noop */ }
  return { ok: true };
}
