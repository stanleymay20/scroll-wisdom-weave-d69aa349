/**
 * Client-side audit log helpers — call the secure RPC `log_audit_event`.
 * Direct INSERTs are blocked by RLS; everything must go through the SECURITY DEFINER fn.
 */
import { supabase } from "@/integrations/supabase/client";

export type AuditSeverity = "info" | "warn" | "error" | "critical";

export interface AuditPayload {
  eventType: string;
  actorId?: string | null;
  organizationId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  severity?: AuditSeverity;
  metadata?: Record<string, unknown>;
}

export async function logAudit(p: AuditPayload): Promise<void> {
  try {
    const { error } = await supabase.rpc("log_audit_event", {
      _event_type: p.eventType,
      _actor_id: p.actorId ?? null,
      _organization_id: p.organizationId ?? null,
      _resource_type: p.resourceType ?? null,
      _resource_id: p.resourceId ?? null,
      _severity: p.severity ?? "info",
      _metadata: (p.metadata ?? {}) as never,
    });
    if (error) console.warn("[audit] logAudit failed", error.message);
  } catch (e) {
    console.warn("[audit] logAudit threw", e);
  }
}
