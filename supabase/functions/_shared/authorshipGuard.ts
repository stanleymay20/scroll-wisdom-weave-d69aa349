// _shared/authorshipGuard.ts
// Append-only audit logger for authorship, rights, ownership, and export
// events — including denied attempts. Use from every edge function that
// touches a protected surface.

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type GuardAction =
  | "publish"
  | "unpublish"
  | "export"
  | "ownership_transfer_request"
  | "ownership_transfer_accept"
  | "ownership_transfer_cancel"
  | "authorship_edit"
  | "rights_edit"
  | "metadata_edit"
  | "denied";

export interface AuditEntry {
  workId?: string | null;
  bookId?: string | null;
  publicationId?: string | null;
  userId: string | null;
  action: GuardAction;
  field?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  allowed: boolean;
  reason?: string | null;
  correlationId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function logAuthorshipEvent(sc: SupabaseClient, entry: AuditEntry): Promise<void> {
  try {
    await sc.from("authorship_audit_log").insert({
      work_id: entry.workId ?? null,
      book_id: entry.bookId ?? null,
      publication_id: entry.publicationId ?? null,
      user_id: entry.userId,
      actor_kind: "user",
      action: entry.action,
      field_name: entry.field ?? null,
      old_value: entry.oldValue === undefined ? null : entry.oldValue,
      new_value: entry.newValue === undefined ? null : entry.newValue,
      allowed: entry.allowed,
      reason: entry.reason ?? null,
      correlation_id: entry.correlationId ?? null,
      metadata: entry.metadata ?? {},
    });
  } catch (e) {
    // Never let audit failures block the request — but surface in logs.
    console.error("[authorshipGuard] audit insert failed", e);
  }
}
