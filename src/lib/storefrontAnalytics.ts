import { supabase } from "@/integrations/supabase/client";

export type StorefrontEvent =
  | "sample_open" | "sample_complete" | "cta_click" | "buy_click" | "share_click"
  | "kdp_export_started" | "kdp_export_completed" | "kdp_export_failed"
  | "gumroad_export_started" | "gumroad_export_completed" | "gumroad_export_failed"
  | "listing_view" | "listing_publish" | "listing_unpublish"
  | "checkout_started" | "checkout_completed" | "checkout_failed" | "full_book_unlocked"
  | "earnings_view" | "payout_profile_view" | "payout_profile_update"
  | "admin_finance_view" | "platform_fee_updated"
  | "sell_onboarding_started" | "sell_payout_connected" | "sell_first_book_published"
  | "export_preview_opened" | "export_quality_warning" | "export_quality_blocked"
  | "export_completed" | "export_failed"
  | "library_sell_clicked" | "sell_book_preselected"
  | "listing_created" | "listing_updated" | "storefront_viewed_after_publish"
  | "purchase_failed" | "full_reader_opened"
  | "canonical_pdf_export_used" | "canonical_pdf_export_fallback_used"
  | "canonical_docx_export_used" | "canonical_docx_export_fallback_used";


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
