// Phase 2.1a — observability helpers.
// Shared utilities for correlation IDs, financial event logging,
// export job telemetry, and severity escalation.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

/** Generate or extract a correlation id. Prefer caller-provided ids when present. */
export function correlationId(req?: Request, fallback?: string): string {
  const fromHeader = req?.headers.get("x-correlation-id") ?? req?.headers.get("x-request-id");
  if (fromHeader && fromHeader.length <= 128) return fromHeader;
  if (fallback) return fallback;
  return crypto.randomUUID();
}

export type FinancialEventSeverity = "info" | "warn" | "error" | "critical";
export type FinancialEventActor = "system" | "admin" | "user" | "webhook";

export interface FinancialEventInput {
  event_type: string;
  severity?: FinancialEventSeverity;
  actor?: FinancialEventActor;
  correlation_id?: string;
  purchase_id?: string | null;
  stripe_event_id?: string | null;
  user_id?: string | null;
  payload?: Record<string, unknown>;
  dead_letter_reason?: string;
}

/** Best-effort: never throw from logging. */
export async function logFinancialEvent(sc: SupabaseClient, e: FinancialEventInput): Promise<void> {
  try {
    const row = {
      event_type: e.event_type,
      severity: e.severity ?? "info",
      actor: e.actor ?? "system",
      correlation_id: e.correlation_id ?? null,
      purchase_id: e.purchase_id ?? null,
      stripe_event_id: e.stripe_event_id ?? null,
      user_id: e.user_id ?? null,
      payload: e.payload ?? {},
      dead_letter_reason: e.dead_letter_reason ?? null,
      dead_lettered_at: e.dead_letter_reason ? new Date().toISOString() : null,
    };
    const { error } = await sc.from("financial_events").insert(row);
    if (error) console.error("[financial_events insert failed]", error.message);
  } catch (err) {
    console.error("[financial_events] unexpected", err);
  }
}

export interface ExportTelemetryInput {
  job_id: string;
  phase: string;
  duration_ms?: number;
  memory_mb?: number;
  error_code?: string;
  correlation_id?: string;
  metadata?: Record<string, unknown>;
}

export async function logExportPhase(sc: SupabaseClient, e: ExportTelemetryInput): Promise<void> {
  try {
    const { error } = await sc.from("export_job_telemetry").insert({
      job_id: e.job_id,
      phase: e.phase,
      duration_ms: e.duration_ms ?? null,
      memory_mb: e.memory_mb ?? null,
      error_code: e.error_code ?? null,
      correlation_id: e.correlation_id ?? null,
      metadata: e.metadata ?? {},
    });
    if (error) console.error("[export_job_telemetry insert failed]", error.message);
  } catch (err) {
    console.error("[export_job_telemetry] unexpected", err);
  }
}

/** Approx Deno RSS in MB; returns undefined if unavailable. */
export function memoryMb(): number | undefined {
  try {
    // @ts-ignore Deno specific
    const mem = (Deno as any).memoryUsage?.();
    if (mem?.rss) return Math.round((mem.rss / 1024 / 1024) * 10) / 10;
  } catch (_) { /* ignore */ }
  return undefined;
}

/** Phase timer that logs duration on stop. */
export class PhaseTimer {
  private t0 = Date.now();
  constructor(
    private sc: SupabaseClient,
    private jobId: string,
    private correlationId: string,
  ) {}

  async stop(phase: string, extra?: { error_code?: string; metadata?: Record<string, unknown> }) {
    await logExportPhase(this.sc, {
      job_id: this.jobId,
      phase,
      duration_ms: Date.now() - this.t0,
      memory_mb: memoryMb(),
      correlation_id: this.correlationId,
      error_code: extra?.error_code,
      metadata: extra?.metadata,
    });
    this.t0 = Date.now();
  }
}

export interface FraudSignalInput {
  subject_type: "user" | "ip" | "email" | "device" | "book" | "listing";
  subject_value: string;
  signal_type: string;
  score?: number;
  source?: string;
  correlation_id?: string;
  metadata?: Record<string, unknown>;
}

export async function logFraudSignal(sc: SupabaseClient, s: FraudSignalInput): Promise<void> {
  try {
    const { error } = await sc.from("fraud_signals").insert({
      subject_type: s.subject_type,
      subject_value: s.subject_value,
      signal_type: s.signal_type,
      score: s.score ?? 0,
      source: s.source ?? "system",
      correlation_id: s.correlation_id ?? null,
      metadata: s.metadata ?? {},
    });
    if (error) console.error("[fraud_signals insert failed]", error.message);
  } catch (err) {
    console.error("[fraud_signals] unexpected", err);
  }
}

/**
 * Evaluate severity for a metric against alert_thresholds.
 * Returns the highest tier triggered (critical > warn > info).
 */
export async function evaluateSeverity(
  sc: SupabaseClient,
  key: string,
  value: number,
): Promise<FinancialEventSeverity> {
  try {
    const { data } = await sc.from("alert_thresholds").select("warn_value, critical_value, enabled").eq("key", key).maybeSingle();
    if (!data || !data.enabled) return "info";
    if (data.critical_value != null && value >= Number(data.critical_value)) return "critical";
    if (data.warn_value != null && value >= Number(data.warn_value)) return "warn";
    return "info";
  } catch {
    return "info";
  }
}
