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

// ---------------------------------------------------------------------------
// Alerting
// ---------------------------------------------------------------------------
// financial_events has always recorded invalid webhook signatures, failed event
// claims and dead-lettered payments at critical severity — into a table nothing
// watched. Logging is not alerting: without this, mean time to detection for a
// payment outage is "a customer complains".
//
// Dispatch is deliberately at write time rather than from a polling worker.
// There is no pg_net in this project and the scheduler for the existing pg_cron
// workers lives outside the repository, so a poller would add infrastructure
// that cannot be verified here. Alerting inline keeps detection immediate and
// the moving parts to one.
//
// The sink is a plain JSON webhook so it works with Slack, Discord, PagerDuty
// Events API or anything else that accepts a POST; pointing it somewhere is a
// configuration change, not a code change. With ALERT_WEBHOOK_URL unset the
// path is inert apart from one log line.

/** Severities that should reach a human immediately. */
const ALERTABLE_SEVERITIES: ReadonlySet<string> = new Set(["error", "critical"]);

/**
 * Whether an event warrants paging someone. Dead-lettered events always do,
 * whatever severity they carry: a dead letter means money work was abandoned.
 *
 * Pure and exported so the decision is unit-testable without a network or a
 * database.
 */
export function shouldAlert(e: FinancialEventInput): boolean {
  if (e.dead_letter_reason) return true;
  return ALERTABLE_SEVERITIES.has(e.severity ?? "info");
}

/** Compact, human-first alert payload. Never includes the raw event payload,
 *  which can carry customer data — the correlation id is the join key. */
export function buildAlertBody(e: FinancialEventInput): Record<string, unknown> {
  const severity = e.severity ?? "info";
  const reason = e.dead_letter_reason ? ` (dead-lettered: ${e.dead_letter_reason})` : "";
  return {
    text: `[ScrollLibrary] ${severity.toUpperCase()} financial event: ${e.event_type}${reason}`,
    severity,
    event_type: e.event_type,
    actor: e.actor ?? "system",
    correlation_id: e.correlation_id ?? null,
    stripe_event_id: e.stripe_event_id ?? null,
    purchase_id: e.purchase_id ?? null,
    dead_letter_reason: e.dead_letter_reason ?? null,
    occurred_at: new Date().toISOString(),
  };
}

/**
 * Best-effort alert dispatch. Never throws and never blocks the caller: an
 * alerting problem must not become a payment problem.
 */
export function dispatchFinancialAlert(e: FinancialEventInput): void {
  if (!shouldAlert(e)) return;

  const url = Deno.env.get("ALERT_WEBHOOK_URL");
  if (!url) {
    console.error(
      `[alert:unconfigured] ${e.severity ?? "info"} ${e.event_type} — set ALERT_WEBHOOK_URL to page on this`,
    );
    return;
  }

  try {
    const send = fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildAlertBody(e)),
      signal: AbortSignal.timeout(5_000),
    })
      .then((res) => {
        if (!res.ok) console.error(`[alert:failed] webhook returned ${res.status} for ${e.event_type}`);
      })
      .catch((err) => console.error(`[alert:failed] ${e.event_type}`, err));

    // Keep the request alive past the response where the runtime supports it,
    // without making the caller wait for the webhook.
    const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
    runtime?.waitUntil?.(send);
  } catch (err) {
    console.error(`[alert:failed] dispatch threw for ${e.event_type}`, err);
  }
}

/** Best-effort: never throw from logging. */
export async function logFinancialEvent(sc: SupabaseClient, e: FinancialEventInput): Promise<void> {
  // Alert first. If the insert itself is what is broken, the page still goes
  // out rather than being lost with the row.
  dispatchFinancialAlert(e);

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
