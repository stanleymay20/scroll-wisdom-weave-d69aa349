import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  preflight,
  json,
  requireUser,
  validateBody,
  enforceDurableRateLimit,
  serviceClient,
  z,
} from "../_shared/http.ts";

const EventTypeSchema = z.enum([
  "book_generated",
  "chapter_completed",
  "quiz_completed",
  "certificate_issued",
  "second_book",
  "upgrade_clicked",
  "paid_conversion",
]);

const AttributionSchema = z.object({
  session_id: z.string().max(128).optional(),
  source: z.string().max(256).optional(),
  medium: z.string().max(256).nullable().optional(),
  campaign: z.string().max(256).nullable().optional(),
  term: z.string().max(256).nullable().optional(),
  content: z.string().max(256).nullable().optional(),
  referrer: z.string().max(2048).nullable().optional(),
  landing_path: z.string().max(2048).nullable().optional(),
}).partial();

const BodySchema = z.object({
  eventType: EventTypeSchema,
  metadata: z.record(z.unknown()).optional().default({}),
  attribution: AttributionSchema.optional().default({}),
});

const SAFE_METADATA_KEYS = new Set([
  "category",
  "totalBooks",
  "score",
  "passed",
  "plan",
  "quizType",
  "chapterIndex",
  "attempt",
  "durationMs",
  "format",
]);

function safeMetadata(input: Record<string, unknown>): Record<string, string | number | boolean | null> {
  const output: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!SAFE_METADATA_KEYS.has(key)) continue;
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      output[key] = typeof value === "string" ? value.slice(0, 256) : value;
    }
  }
  return output;
}

async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  const parsed = await validateBody(req, BodySchema);
  if (parsed instanceof Response) return parsed;

  const ingestUrl = Deno.env.get("SCROLLMARKETER_INGEST_URL");
  const ingestSecret = Deno.env.get("SCROLLMARKETER_INGEST_SECRET");
  const idSalt = Deno.env.get("SCROLLMARKETER_ID_SALT") || ingestSecret;

  // Telemetry must never become a product availability dependency.
  if (!ingestUrl || !ingestSecret || !idSalt) {
    console.warn("[relay-growth-event] ScrollMarketer bridge not configured");
    return json({ forwarded: false, reason: "not_configured" }, 200);
  }

  const admin = serviceClient();
  const rateLimited = await enforceDurableRateLimit(admin, {
    name: "relay-growth-event",
    key: auth.userId,
    limit: 240,
    windowSec: 3600,
  });
  if (rateLimited) return rateLimited;

  const externalUserKey = await sha256Hex(`${idSalt}:${auth.userId}`);
  const attribution = parsed.attribution || {};
  const outbound = {
    product_key: "scrolllibrary",
    external_event_id: crypto.randomUUID(),
    external_user_key: externalUserKey,
    session_id: attribution.session_id ?? null,
    event_type: parsed.eventType,
    occurred_at: new Date().toISOString(),
    attribution: {
      source: attribution.source ?? "direct",
      medium: attribution.medium ?? null,
      campaign: attribution.campaign ?? null,
      term: attribution.term ?? null,
      content: attribution.content ?? null,
      referrer: attribution.referrer ?? null,
      landing_path: attribution.landing_path ?? null,
    },
    metadata: safeMetadata(parsed.metadata),
  };

  const raw = JSON.stringify(outbound);
  const signature = await hmacSha256Hex(ingestSecret, raw);

  try {
    const response = await fetch(ingestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Signature": `sha256=${signature}`,
      },
      body: raw,
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      console.error("[relay-growth-event] downstream rejected event", {
        status: response.status,
        eventType: parsed.eventType,
        detail,
      });
      return json({ forwarded: false, reason: "downstream_rejected" }, 502);
    }

    return json({ forwarded: true }, 200);
  } catch (error) {
    console.error("[relay-growth-event] downstream unavailable", {
      eventType: parsed.eventType,
      error: error instanceof Error ? error.message : String(error),
    });
    return json({ forwarded: false, reason: "downstream_unavailable" }, 502);
  }
});
