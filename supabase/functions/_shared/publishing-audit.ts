// Shared helper to write to publishing_audit_log. Service-role only.
export type PublishEvent =
  | "publish_started" | "publish_completed" | "publish_failed"
  | "sync_started" | "sync_completed" | "sync_failed"
  | "token_revoked" | "token_expired"
  | "external_updated" | "external_deleted" | "external_unpublished";

export async function logPublishEvent(admin: any, params: {
  user_id: string;
  platform: string;
  event_type: PublishEvent;
  book_id?: string | null;
  listing_id?: string | null;
  external_id?: string | null;
  external_url?: string | null;
  severity?: "info" | "warning" | "error";
  message?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    await admin.from("publishing_audit_log").insert({
      user_id: params.user_id,
      book_id: params.book_id ?? null,
      listing_id: params.listing_id ?? null,
      platform: params.platform,
      event_type: params.event_type,
      external_id: params.external_id ?? null,
      external_url: params.external_url ?? null,
      severity: params.severity ?? "info",
      message: params.message ?? null,
      metadata: params.metadata ?? {},
    });
  } catch (e) {
    console.error("publishing_audit_log insert failed", e);
  }
}
