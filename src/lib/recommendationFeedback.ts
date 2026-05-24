// Fire-and-forget recommendation rail telemetry.
// Logs shown / clicked / sampled / purchased / hidden events for ranking signals.
import { supabase } from "@/integrations/supabase/client";

export type RecSource =
  | "trending" | "top_selling" | "recent" | "related" | "same_author"
  | "same_series" | "collection" | "continue_reading" | "search" | "author_profile"
  | "recommended" | "recommended_for_user" | "from_followed_authors" | "continue_series";

export type RecAction = "shown" | "clicked" | "sampled" | "purchased" | "hidden";

export interface RecEvent {
  source: RecSource;
  action: RecAction;
  listing_id?: string | null;
  book_id?: string | null;
  position?: number | null;
  metadata?: Record<string, unknown>;
}

function sessionId(): string {
  const KEY = "sl_session_id";
  let s = sessionStorage.getItem(KEY);
  if (!s) { s = crypto.randomUUID(); sessionStorage.setItem(KEY, s); }
  return s;
}

export async function logRecommendationEvent(ev: RecEvent): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.functions.invoke("log-recommendation-feedback", {
      body: { ...ev, session_id: sessionId(), user_id: user?.id ?? null },
    });
  } catch { /* swallow */ }
}

export async function logRecommendationBatch(events: RecEvent[]): Promise<void> {
  if (!events.length) return;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.functions.invoke("log-recommendation-feedback", {
      body: { session_id: sessionId(), user_id: user?.id ?? null, items: events },
    });
  } catch { /* swallow */ }
}
