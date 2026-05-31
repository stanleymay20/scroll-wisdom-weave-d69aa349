// Logs recommendation rail telemetry: shown / clicked / sampled / purchased / hidden.
// Public POST. Rate-limited per IP + session. Service-role insert only.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders, preflight, json, badRequest, serverError,
  serviceClient, validateBody, z, clientIp, enforceRateLimit,
  enforcePersistentVelocity,
} from "../_shared/http.ts";

const ALLOWED_SOURCES = [
  "trending", "top_selling", "recent", "related", "same_author",
  "same_series", "collection", "continue_reading", "search", "author_profile",
  "recommended", "recommended_for_user", "from_followed_authors", "continue_series",
] as const;

const ItemSchema = z.object({
  source: z.enum(ALLOWED_SOURCES),
  action: z.enum(["shown","clicked","sampled","purchased","hidden"]),
  listing_id: z.string().uuid().optional().nullable(),
  book_id: z.string().uuid().optional().nullable(),
  position: z.number().int().min(0).max(500).optional().nullable(),
  metadata: z.record(z.any()).optional(),
});

const Body = z.union([
  ItemSchema.extend({
    session_id: z.string().max(128).optional(),
    user_id: z.string().uuid().optional().nullable(),
  }),
  z.object({
    session_id: z.string().max(128).optional(),
    user_id: z.string().uuid().optional().nullable(),
    items: z.array(ItemSchema).min(1).max(60),
  }),
]);

serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== "POST") return badRequest("POST only");

  const ip = clientIp(req);
  const limited = enforceRateLimit({ name: "log-rec-feedback", key: ip, limit: 600, windowSec: 60 });
  if (limited) return limited;

  const parsed = await validateBody(req, Body);
  if (parsed instanceof Response) return parsed;

  try {
    const sc = serviceClient();
    const velIp = await enforcePersistentVelocity(sc, {
      name: "rec-feedback:ip", key: ip, limit: 600, windowSec: 60,
    });
    if (velIp) return velIp;

    const session_id = (parsed as any).session_id ?? null;
    const user_id = (parsed as any).user_id ?? null;
    const items: any[] = Array.isArray((parsed as any).items)
      ? (parsed as any).items
      : [parsed];

    const rows = items.map((it: any) => ({
      user_id, session_id,
      source: it.source,
      action: it.action,
      listing_id: it.listing_id ?? null,
      book_id: it.book_id ?? null,
      position: it.position ?? null,
      metadata: it.metadata ?? {},
    }));

    const { error } = await sc.from("recommendation_feedback").insert(rows);
    if (error) return serverError(error, "insert_failed");
    return json({ ok: true, count: rows.length });
  } catch (e) { return serverError(e); }
});
