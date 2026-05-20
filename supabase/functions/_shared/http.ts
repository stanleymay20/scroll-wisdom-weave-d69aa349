// Shared HTTP utilities for ScrollLibrary edge functions.
// Provides hardened CORS, JSON helpers, JWT auth, Zod validation
// and a lightweight per-instance rate limiter.
//
// Usage:
//   import { corsHeaders, json, badRequest, unauthorized,
//            requireUser, validateBody, rateLimit } from "../_shared/http.ts";

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z, ZodSchema } from "https://esm.sh/zod@3.23.8";

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

export function preflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return null;
}

// ---------------------------------------------------------------------------
// JSON response helpers
// ---------------------------------------------------------------------------
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

export function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...jsonHeaders, ...extraHeaders },
  });
}

export function badRequest(message: string, details?: unknown): Response {
  return json({ error: message, code: "bad_request", details }, 400);
}

export function unauthorized(message = "Unauthorized"): Response {
  return json({ error: message, code: "unauthorized" }, 401);
}

export function forbidden(message = "Forbidden"): Response {
  return json({ error: message, code: "forbidden" }, 403);
}

export function tooManyRequests(retryAfterSec: number, message = "Rate limit exceeded"): Response {
  return json({ error: message, code: "rate_limited", retry_after: retryAfterSec }, 429, {
    "Retry-After": String(retryAfterSec),
  });
}

export function serverError(err: unknown, code = "internal_error"): Response {
  const message = err instanceof Error ? err.message : "Unknown error";
  // Avoid leaking stack traces to clients.
  return json({ error: message, code }, 500);
}

// ---------------------------------------------------------------------------
// Auth: validate the user's JWT and return their user_id + a scoped client.
// ---------------------------------------------------------------------------
export interface AuthedRequest {
  userId: string;
  email: string | null;
  role: string | null;
  client: SupabaseClient;
  token: string;
}

export async function requireUser(req: Request): Promise<AuthedRequest | Response> {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return unauthorized("Missing bearer token");
  }
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return unauthorized("Empty bearer token");

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return serverError(new Error("Auth backend not configured"), "auth_misconfigured");
  }

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // getClaims verifies the JWT signature using the project's signing keys.
  // Falls back to getUser() if getClaims is not available in the SDK.
  let userId: string | null = null;
  let email: string | null = null;
  let role: string | null = null;

  try {
    // deno-lint-ignore no-explicit-any
    const anyAuth = client.auth as any;
    if (typeof anyAuth.getClaims === "function") {
      const { data, error } = await anyAuth.getClaims(token);
      if (error || !data?.claims?.sub) return unauthorized();
      userId = data.claims.sub;
      email = data.claims.email ?? null;
      role = data.claims.role ?? null;
    } else {
      const { data, error } = await client.auth.getUser(token);
      if (error || !data?.user?.id) return unauthorized();
      userId = data.user.id;
      email = data.user.email ?? null;
      role = data.user.role ?? null;
    }
  } catch (_e) {
    return unauthorized();
  }

  return { userId: userId!, email, role, client, token };
}

// ---------------------------------------------------------------------------
// Validation: parse JSON bodies safely with Zod.
// ---------------------------------------------------------------------------
export async function validateBody<T>(req: Request, schema: ZodSchema<T>): Promise<T | Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return badRequest("Validation failed", parsed.error.flatten().fieldErrors);
  }
  return parsed.data;
}

export function validateQuery<T>(req: Request, schema: ZodSchema<T>): T | Response {
  const url = new URL(req.url);
  const obj: Record<string, string> = {};
  url.searchParams.forEach((v, k) => (obj[k] = v));
  const parsed = schema.safeParse(obj);
  if (!parsed.success) {
    return badRequest("Invalid query parameters", parsed.error.flatten().fieldErrors);
  }
  return parsed.data;
}

// Re-export zod so callers don't need a second import.
export { z };

// ---------------------------------------------------------------------------
// Rate limiting (in-memory, per edge instance).
// Good enough as a first line of defence against abuse / runaway loops.
// For cross-instance limits, back this with a database counter.
// ---------------------------------------------------------------------------
interface Bucket {
  count: number;
  resetAt: number;
}
const buckets = new Map<string, Bucket>();

export interface RateLimitOptions {
  /** Logical bucket name (e.g. function name). */
  name: string;
  /** Identifier — typically userId or IP. */
  key: string;
  /** Max requests allowed in the window. */
  limit: number;
  /** Window length in seconds. */
  windowSec: number;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfter: number;
}

export function rateLimit(opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const bucketKey = `${opts.name}:${opts.key}`;
  const existing = buckets.get(bucketKey);

  if (!existing || existing.resetAt <= now) {
    buckets.set(bucketKey, { count: 1, resetAt: now + opts.windowSec * 1000 });
    return { ok: true, remaining: opts.limit - 1, retryAfter: 0 };
  }

  if (existing.count >= opts.limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return { ok: true, remaining: opts.limit - existing.count, retryAfter: 0 };
}

/**
 * Convenience wrapper: enforces a per-user rate limit and returns a 429
 * Response if exceeded, or null when the request may proceed.
 */
export function enforceRateLimit(opts: RateLimitOptions): Response | null {
  const r = rateLimit(opts);
  if (!r.ok) return tooManyRequests(r.retryAfter);
  return null;
}

// ---------------------------------------------------------------------------
// Service-role client (use ONLY in trusted server-side flows).
// ---------------------------------------------------------------------------
export function serviceClient(): SupabaseClient {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Service role not configured");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Extract a stable identifier for rate-limit keying when no user is present. */
export function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    "anonymous"
  );
}

// ---------------------------------------------------------------------------
// Persistent (cross-instance) velocity gate, backed by public.check_velocity.
// Use for abuse-prone endpoints (free unlocks, exports, attribution beacon,
// anonymous event ingestion). In-memory rateLimit() is still useful as a
// cheap first line, but it does NOT survive cold starts or scale-out.
// ---------------------------------------------------------------------------
export interface VelocityOptions {
  /** Logical bucket name, e.g. "checkout:free". */
  name: string;
  /** Identifier — userId, ipHash, uaHash, or composite. */
  key: string;
  limit: number;
  windowSec: number;
}

export async function enforcePersistentVelocity(
  sc: SupabaseClient,
  opts: VelocityOptions,
): Promise<Response | null> {
  try {
    const { data, error } = await sc.rpc("check_velocity", {
      _key: `${opts.name}:${opts.key}`,
      _limit: opts.limit,
      _window_seconds: opts.windowSec,
    });
    if (error) throw error;
    const ok = (data as any)?.ok;
    if (ok === false) {
      const retry = Number((data as any)?.retry_after ?? opts.windowSec);
      return tooManyRequests(retry);
    }
    return null;
  } catch (e) {
    // Fail-open on velocity infra errors — never block legitimate traffic
    // because the counter is unavailable. Emit a warn financial_event so
    // ops can see when the gate is silently disabled (Phase 2.1c.2).
    try {
      await sc.from("financial_events").insert({
        event_type: "velocity_check_failed_open",
        severity: "warn",
        actor: "system",
        payload: { name: opts.name, key_prefix: opts.key.slice(0, 16), error: e instanceof Error ? e.message : String(e) },
      });
    } catch (_) { /* swallow */ }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Risk-tier gate (Phase 2.1c.2). Checks user_risk_scores and enforces
// based on the requested action. Manual override always wins (handled by
// the get_effective_user_tier RPC).
// ---------------------------------------------------------------------------
export type RiskAction = "free_unlock" | "export" | "paid_checkout";

export async function enforceUserRiskTier(
  sc: SupabaseClient,
  userId: string | null | undefined,
  action: RiskAction,
): Promise<Response | null> {
  if (!userId) return null;
  try {
    const { data } = await sc.from("user_risk_scores")
      .select("tier, manual_override_tier, score, reasons")
      .eq("user_id", userId).maybeSingle();
    if (!data) return null;
    const tier = (data as any).manual_override_tier ?? (data as any).tier ?? "low";
    const blocks =
      tier === "blocked" ? true :
      tier === "high" ? (action === "free_unlock" || action === "export") :
      false;
    if (!blocks) return null;
    return json({
      error: "Action blocked by risk policy",
      code: "risk_blocked",
      tier,
      action,
      contact: "Reply to support if this is in error.",
    }, 403);
  } catch (_e) {
    // Fail-open — never block on risk lookup failure.
    return null;
  }
}

// ---------------------------------------------------------------------------
// Lightweight device/UA fingerprinting. We never store raw UA strings — only
// a salted SHA-256 hash + a coarse device_class bucket for fraud clustering.
// ---------------------------------------------------------------------------
const UA_SALT = "scrolllibrary-ua-salt-v1";

export async function hashUserAgent(ua: string | null | undefined): Promise<string | null> {
  if (!ua) return null;
  const data = new TextEncoder().encode(`${ua}:${UA_SALT}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function classifyDevice(ua: string | null | undefined): string {
  if (!ua) return "unknown";
  const s = ua.toLowerCase();
  if (/bot|crawler|spider|crawling|preview|headless|axios|curl|wget|python-requests/.test(s)) return "bot";
  if (/ipad|tablet/.test(s)) return "tablet";
  if (/iphone|android.*mobile|mobi|opera mini|windows phone/.test(s)) return "mobile";
  if (/macintosh|mac os x|windows nt|linux|cros/.test(s)) return "desktop";
  return "other";
}
