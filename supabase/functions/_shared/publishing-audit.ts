// Shared helper to write to publishing_audit_log. Service-role only.
//
// Event types here MUST stay in sync with the CHECK constraint defined in
// migration 20260604191712_publishing_pipeline_enterprise_hardening.sql.
// Adding a new event type means: (1) extend the union below, (2) drop+recreate
// the CHECK in a new migration, (3) ensure no existing code path produces the
// retired event name.
export type PublishEvent =
  | "publish_started" | "publish_completed" | "publish_failed" | "publish_retried"
  | "publish_validation_failed"
  | "publish_blocked_by_tier"
  | "sync_started" | "sync_completed" | "sync_failed"
  | "token_revoked" | "token_expired"
  | "external_updated" | "external_deleted" | "external_unpublished"
  | "entitlement_granted" | "entitlement_revoked"
  | "entitlement_overridden" | "entitlement_resynced"
  | "admin_manual_upgrade" | "admin_manual_downgrade"
  | "connection_started" | "connection_completed" | "connection_failed"
  | "connection_disconnected" | "connection_revoked_upstream"
  | "connection_decrypt_failed" | "connection_status_changed";

export type PublishSeverity = "info" | "warning" | "error" | "critical";

export async function logPublishEvent(admin: any, params: {
  user_id: string;
  platform: string | null;
  event_type: PublishEvent;
  book_id?: string | null;
  listing_id?: string | null;
  external_id?: string | null;
  external_url?: string | null;
  severity?: PublishSeverity;
  message?: string | null;
  correlation_id?: string | null;
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
      message: params.message ? String(params.message).slice(0, 1000) : null,
      correlation_id: params.correlation_id ?? null,
      metadata: params.metadata ?? {},
    });
  } catch (e) {
    console.error("publishing_audit_log insert failed", e);
  }
}
