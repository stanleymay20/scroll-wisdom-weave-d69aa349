// Shared AI Router (S1+S2 of the P0 Production Proof Sprint).
//
// Single entry point for every AI Gateway chat-completion call.
//
// Hard rules (per approved sprint constraints):
//   * 402 / 403 / 400 / 404         → STOP immediately, never retry.
//   * 429 / 500 / 502 / 503 / 504   → exponential backoff, max 2 retries.
//   * gemini-2.5-pro                → MUST pass a correlationId; circuit breaker
//                                     opens after 3 consecutive failures globally
//                                     and refuses further pro calls for 60s.
//   * Every successful call         → writes one row to ai_attribution_ledger
//                                     and one row to ai_usage_tracking.
//   * Identical prompt+model        → in-memory LRU cache (per worker) returns
//                                     cached payload, still emits ledger row with
//                                     cached=true and cost_cents=0.
//
// Cache scope: in-process LRU only this sprint. Cross-worker caching deferred
// because it requires a new `ai_response_cache` table; the existing tables do
// not have a `response_body` column. Documented in the sprint plan.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type RouterTask =
  | "outline" | "draft" | "compress" | "polish" | "stress_test"
  | "editorial_audit" | "citation_verify" | "kg_extract" | "quiz" | "flashcard"
  | "metadata" | "seo" | "qa_answer" | "qa_rewrite" | "grade" | "classify"
  | "summarize" | "code_audit" | "intelligence" | "art_director" | "other";

export interface RouteInput {
  task: RouterTask;
  model: string;                  // exact "vendor/model" id, caller decides tier
  system?: string;
  prompt: string;                 // user content (string for now)
  messages?: Array<{ role: string; content: string }>; // overrides system+prompt if provided
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "json_object" | "text";

  // Attribution context (S2)
  userId?: string;
  workId?: string;
  publicationId?: string;
  chapterId?: string;
  correlationId?: string;

  // Behaviour
  timeoutMs?: number;             // default 30_000
  allowCache?: boolean;           // default true
}

export interface RouteResult {
  ok: true;
  text: string;
  model: string;                  // model actually used
  cached: boolean;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  durationMs: number;
  correlationId: string;
  ledgerId: string | null;
}

export interface RouteFailure {
  ok: false;
  errorCode:
    | "PAYMENT_REQUIRED"          // 402 — stop, never retry
    | "FORBIDDEN"                 // 403 — stop, model not authorized
    | "BAD_REQUEST"               // 400 — stop, prompt malformed
    | "NOT_FOUND"                 // 404 — stop
    | "RATE_LIMITED"              // 429 — gave up after backoff
    | "UPSTREAM_ERROR"            // 5xx — gave up after backoff
    | "TIMEOUT"
    | "CIRCUIT_OPEN"              // pro breaker tripped
    | "INTERNAL";
  status: number;
  message: string;
  retried: number;
  correlationId: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const HARD_STOP_STATUSES = new Set([400, 402, 403, 404]);
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);

// Cost model: cents per 1M tokens (approx, used for ledger telemetry only).
const COST_TABLE: Record<string, { in: number; out: number }> = {
  "google/gemini-2.5-pro":        { in: 125, out: 1000 },
  "google/gemini-2.5-flash":      { in:  30, out:  250 },
  "google/gemini-2.5-flash-lite": { in:  10, out:   40 },
  "google/gemini-3-flash-preview":{ in:  30, out:  250 },
  "google/gemini-3-pro-image-preview": { in: 0, out: 0 }, // image; not handled here
};

// ────────────────────────────────────────────────────────────────────────────
// In-memory LRU cache (per worker)
// ────────────────────────────────────────────────────────────────────────────

const CACHE_MAX = 256;
const cache = new Map<string, { text: string; inputTokens: number; outputTokens: number; model: string }>();

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ────────────────────────────────────────────────────────────────────────────
// Circuit breaker for gemini-2.5-pro
// ────────────────────────────────────────────────────────────────────────────

const PRO_MODEL = "google/gemini-2.5-pro";
const PRO_BREAKER = {
  consecutiveFailures: 0,
  openedAt: 0,
  COOLDOWN_MS: 60_000,
  FAILURE_THRESHOLD: 3,
};

function proBreakerIsOpen(): boolean {
  if (PRO_BREAKER.consecutiveFailures < PRO_BREAKER.FAILURE_THRESHOLD) return false;
  if (Date.now() - PRO_BREAKER.openedAt > PRO_BREAKER.COOLDOWN_MS) {
    // half-open: reset on next attempt
    PRO_BREAKER.consecutiveFailures = 0;
    PRO_BREAKER.openedAt = 0;
    return false;
  }
  return true;
}

function recordProResult(ok: boolean) {
  if (ok) {
    PRO_BREAKER.consecutiveFailures = 0;
    PRO_BREAKER.openedAt = 0;
  } else {
    PRO_BREAKER.consecutiveFailures++;
    if (PRO_BREAKER.consecutiveFailures >= PRO_BREAKER.FAILURE_THRESHOLD && PRO_BREAKER.openedAt === 0) {
      PRO_BREAKER.openedAt = Date.now();
    }
  }
}

// Test-only helper
export function __resetProBreaker() {
  PRO_BREAKER.consecutiveFailures = 0;
  PRO_BREAKER.openedAt = 0;
  cache.clear();
}

// ────────────────────────────────────────────────────────────────────────────
// Backoff (only for 429/5xx; bounded)
// ────────────────────────────────────────────────────────────────────────────

const MAX_RETRIES_RETRYABLE = 2;     // 1 + 2 = 3 total attempts max
const BACKOFF_BASE_MS = 500;
const BACKOFF_CAP_MS = 4_000;

function backoffDelay(attempt: number): number {
  const exp = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * Math.pow(2, attempt));
  return Math.round(exp * (0.7 + Math.random() * 0.6)); // ±30% jitter
}

// ────────────────────────────────────────────────────────────────────────────
// Telemetry
// ────────────────────────────────────────────────────────────────────────────

function logLine(input: RouteInput, fields: Record<string, unknown>) {
  console.log("[AI-ROUTER]", JSON.stringify({
    task: input.task,
    model: input.model,
    userId: input.userId,
    workId: input.workId,
    correlationId: fields.correlationId ?? input.correlationId,
    ...fields,
  }));
}

async function writeLedger(
  supabase: SupabaseClient,
  input: RouteInput,
  promptHash: string,
  modelUsed: string,
  inputTokens: number,
  outputTokens: number,
  costCents: number,
  correlationId: string,
  cached: boolean,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("ai_attribution_ledger")
      .insert({
        work_id: input.workId ?? null,
        publication_id: input.publicationId ?? null,
        chapter_id: input.chapterId ?? null,
        model_name: modelUsed,
        model_provider: modelUsed.split("/")[0] ?? null,
        prompt_hash: promptHash,
        operation: input.task,
        purpose: cached ? "cache_hit" : "generation",
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_cents: costCents,
        correlation_id: correlationId,
      })
      .select("id")
      .single();
    if (error) {
      console.warn("[AI-ROUTER] ledger insert failed:", error.message);
      return null;
    }
    return data?.id ?? null;
  } catch (e) {
    console.warn("[AI-ROUTER] ledger insert threw:", (e as Error).message);
    return null;
  }
}

async function writeUsage(
  supabase: SupabaseClient,
  input: RouteInput,
  modelUsed: string,
  costCents: number,
): Promise<void> {
  if (!input.userId) return;
  try {
    await supabase.from("ai_usage_tracking").insert({
      user_id: input.userId,
      feature: input.task,
      model_used: modelUsed,
      credits_used: Math.max(1, Math.round(costCents / 100)),
      metadata: { workId: input.workId ?? null, publicationId: input.publicationId ?? null },
    });
  } catch (e) {
    console.warn("[AI-ROUTER] usage insert threw:", (e as Error).message);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Cost calc
// ────────────────────────────────────────────────────────────────────────────

function estimateCostCents(model: string, inputTokens: number, outputTokens: number): number {
  const r = COST_TABLE[model];
  if (!r) return 0;
  return Math.ceil((r.in * inputTokens + r.out * outputTokens) / 1_000_000);
}

// ────────────────────────────────────────────────────────────────────────────
// Main entry
// ────────────────────────────────────────────────────────────────────────────

export interface RouterDeps {
  apiKey: string;
  supabaseUrl: string;
  supabaseServiceKey: string;
  fetchImpl?: typeof fetch;       // injectable for tests
}

export async function routeChat(
  input: RouteInput,
  deps: RouterDeps,
): Promise<RouteResult | RouteFailure> {
  const correlationId = input.correlationId ?? crypto.randomUUID();
  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = input.timeoutMs ?? 30_000;
  const allowCache = input.allowCache ?? true;

  // Circuit breaker for pro
  if (input.model === PRO_MODEL && proBreakerIsOpen()) {
    logLine(input, { event: "circuit_open", correlationId });
    return {
      ok: false,
      errorCode: "CIRCUIT_OPEN",
      status: 0,
      message: "gemini-2.5-pro circuit breaker is open (3 consecutive failures in last 60s)",
      retried: 0,
      correlationId,
    };
  }

  // Build messages
  const messages = input.messages ?? [
    ...(input.system ? [{ role: "system", content: input.system }] : []),
    { role: "user", content: input.prompt },
  ];

  // Hash for cache + ledger
  const promptHash = await sha256(JSON.stringify({ model: input.model, messages, temperature: input.temperature ?? null }));

  // In-memory cache lookup
  if (allowCache && cache.has(promptHash)) {
    const hit = cache.get(promptHash)!;
    const supabase = createClient(deps.supabaseUrl, deps.supabaseServiceKey);
    const ledgerId = await writeLedger(supabase, input, promptHash, hit.model, hit.inputTokens, hit.outputTokens, 0, correlationId, true);
    logLine(input, { event: "cache_hit", model: hit.model, correlationId, ledgerId });
    return {
      ok: true,
      text: hit.text,
      model: hit.model,
      cached: true,
      inputTokens: hit.inputTokens,
      outputTokens: hit.outputTokens,
      costCents: 0,
      durationMs: 0,
      correlationId,
      ledgerId,
    };
  }

  // Network attempts (1 + up to MAX_RETRIES_RETRYABLE for 429/5xx only)
  let lastStatus = 0;
  let lastBody = "";
  let retried = 0;

  for (let attempt = 0; attempt <= MAX_RETRIES_RETRYABLE; attempt++) {
    const started = Date.now();
    try {
      const resp = await fetchImpl(GATEWAY_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${deps.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: input.model,
          messages,
          ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
          ...(input.maxTokens ? { max_tokens: input.maxTokens } : {}),
          ...(input.responseFormat === "json_object" ? { response_format: { type: "json_object" } } : {}),
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (resp.ok) {
        const data = await resp.json();
        const text = data?.choices?.[0]?.message?.content ?? "";
        const inputTokens = data?.usage?.prompt_tokens ?? 0;
        const outputTokens = data?.usage?.completion_tokens ?? 0;
        const costCents = estimateCostCents(input.model, inputTokens, outputTokens);
        const durationMs = Date.now() - started;

        // cache (LRU)
        if (allowCache) {
          if (cache.size >= CACHE_MAX) {
            const firstKey = cache.keys().next().value;
            if (firstKey) cache.delete(firstKey);
          }
          cache.set(promptHash, { text, inputTokens, outputTokens, model: input.model });
        }

        if (input.model === PRO_MODEL) recordProResult(true);

        const supabase = createClient(deps.supabaseUrl, deps.supabaseServiceKey);
        const ledgerId = await writeLedger(supabase, input, promptHash, input.model, inputTokens, outputTokens, costCents, correlationId, false);
        await writeUsage(supabase, input, input.model, costCents);

        logLine(input, { event: "ok", durationMs, inputTokens, outputTokens, costCents, attempt, correlationId, ledgerId });

        return {
          ok: true,
          text,
          model: input.model,
          cached: false,
          inputTokens,
          outputTokens,
          costCents,
          durationMs,
          correlationId,
          ledgerId,
        };
      }

      lastStatus = resp.status;
      lastBody = (await resp.text()).slice(0, 300);

      // HARD STOP — never retry
      if (HARD_STOP_STATUSES.has(resp.status)) {
        if (input.model === PRO_MODEL) recordProResult(false);
        const code: RouteFailure["errorCode"] =
          resp.status === 402 ? "PAYMENT_REQUIRED" :
          resp.status === 403 ? "FORBIDDEN" :
          resp.status === 400 ? "BAD_REQUEST" : "NOT_FOUND";
        logLine(input, { event: "hard_stop", status: resp.status, code, attempt, correlationId, body: lastBody });
        return { ok: false, errorCode: code, status: resp.status, message: lastBody, retried, correlationId };
      }

      // RETRYABLE
      if (RETRY_STATUSES.has(resp.status) && attempt < MAX_RETRIES_RETRYABLE) {
        retried++;
        const delay = backoffDelay(attempt);
        logLine(input, { event: "retry", status: resp.status, attempt, delayMs: delay, correlationId });
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      // Out of retries
      if (input.model === PRO_MODEL) recordProResult(false);
      const code: RouteFailure["errorCode"] = resp.status === 429 ? "RATE_LIMITED" : "UPSTREAM_ERROR";
      logLine(input, { event: "gave_up", status: resp.status, retried, correlationId, body: lastBody });
      return { ok: false, errorCode: code, status: resp.status, message: lastBody, retried, correlationId };

    } catch (e) {
      const isTimeout = (e as Error).name === "TimeoutError" || (e as Error).name === "AbortError";
      if (isTimeout && attempt < MAX_RETRIES_RETRYABLE) {
        retried++;
        const delay = backoffDelay(attempt);
        logLine(input, { event: "timeout_retry", attempt, delayMs: delay, correlationId });
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      if (input.model === PRO_MODEL) recordProResult(false);
      logLine(input, { event: "exception", error: (e as Error).message, correlationId });
      return {
        ok: false,
        errorCode: isTimeout ? "TIMEOUT" : "INTERNAL",
        status: 0,
        message: (e as Error).message,
        retried,
        correlationId,
      };
    }
  }

  // Should not reach here
  return { ok: false, errorCode: "INTERNAL", status: lastStatus, message: lastBody, retried, correlationId };
}
