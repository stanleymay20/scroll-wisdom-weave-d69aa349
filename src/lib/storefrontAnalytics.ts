import { supabase } from "@/integrations/supabase/client";

export type StorefrontEvent =
  | "sample_open" | "sample_complete" | "cta_click" | "buy_click" | "share_click"
  | "kdp_export_started" | "kdp_export_completed" | "kdp_export_failed"
  | "gumroad_export_started" | "gumroad_export_completed" | "gumroad_export_failed"
  | "listing_view" | "listing_publish" | "listing_unpublish"
  | "checkout_started" | "checkout_completed" | "checkout_failed" | "full_book_unlocked";

function sessionId(): string {
  const KEY = "sl_session_id";
  let s = sessionStorage.getItem(KEY);
  if (!s) {
    s = crypto.randomUUID();
    sessionStorage.setItem(KEY, s);
  }
  return s;
}

/** Fire-and-forget analytics. Never throws. */
export async function trackStorefrontEvent(
  listingId: string | null,
  eventType: StorefrontEvent,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.functions.invoke("log-storefront-event", {
      body: {
        listing_id: listingId,
        event_type: eventType,
        user_id: user?.id ?? null,
        session_id: sessionId(),
        metadata,
      },
    });
  } catch {
    /* swallow */
  }
}
