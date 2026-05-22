// Logs a storefront search query (or a click on a search result).
// Public POST. Rate-limited per session+IP. No PII beyond optional user_id.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders, preflight, json, badRequest, serverError,
  serviceClient, validateBody, z, clientIp, enforceRateLimit,
  enforcePersistentVelocity,
} from "../_shared/http.ts";

const Body = z.object({
  query: z.string().max(200).optional().default(""),
  results_count: z.number().int().min(0).max(10_000).optional().default(0),
  clicked_book_id: z.string().uuid().optional().nullable(),
  source: z.string().max(40).optional().default("storefront"),
  session_id: z.string().max(128).optional(),
  user_id: z.string().uuid().optional().nullable(),
  metadata: z.record(z.any()).optional(),
});

function normalize(q: string) {
  return q.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ").trim().slice(0, 200);
}

serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== "POST") return badRequest("POST only");

  const ip = clientIp(req);
  const limited = enforceRateLimit({ name: "log-search-query", key: ip, limit: 300, windowSec: 60 });
  if (limited) return limited;

  const parsed = await validateBody(req, Body);
  if (parsed instanceof Response) return parsed;

  try {
    const sc = serviceClient();
    const velIp = await enforcePersistentVelocity(sc, {
      name: "search-query:ip", key: ip, limit: 300, windowSec: 60,
    });
    if (velIp) return velIp;
    if (parsed.session_id) {
      const velSession = await enforcePersistentVelocity(sc, {
        name: "search-query:session", key: parsed.session_id, limit: 120, windowSec: 60,
      });
      if (velSession) return velSession;
    }

    const q = (parsed.query ?? "").slice(0, 200);
    const nq = normalize(q);
    // Skip writes for empty queries with no click signal (avoid noise).
    if (!nq && !parsed.clicked_book_id) return json({ ok: true, skipped: true });

    const { error } = await sc.from("search_queries").insert({
      query: q,
      normalized_query: nq,
      results_count: parsed.results_count ?? 0,
      clicked_book_id: parsed.clicked_book_id ?? null,
      source: parsed.source ?? "storefront",
      session_id: parsed.session_id ?? null,
      user_id: parsed.user_id ?? null,
      metadata: parsed.metadata ?? {},
    });
    if (error) return serverError(error, "insert_failed");
    return json({ ok: true });
  } catch (e) { return serverError(e); }
});
