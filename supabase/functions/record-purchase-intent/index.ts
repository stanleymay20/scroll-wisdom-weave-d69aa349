import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { preflight, json, badRequest, serverError, serviceClient, validateBody, z, clientIp, enforceRateLimit } from "../_shared/http.ts";

const Body = z.object({
  listing_id: z.string().uuid(),
  buyer_email: z.string().email().optional(),
  source: z.enum(["storefront", "kdp", "gumroad", "linkedin"]).default("storefront"),
  metadata: z.record(z.any()).optional(),
});

serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== "POST") return badRequest("POST only");

  const ip = clientIp(req);
  // Conservative throttle: 10 intents per IP per minute
  const limited = enforceRateLimit({ name: "purchase-intent", key: ip, limit: 10, windowSec: 60 });
  if (limited) return limited;

  const parsed = await validateBody(req, Body);
  if (parsed instanceof Response) return parsed;

  try {
    const sc = serviceClient();
    const { data: listing, error: lookupErr } = await sc
      .from("public_listings").select("id, is_public").eq("id", parsed.listing_id).maybeSingle();
    if (lookupErr) return serverError(lookupErr, "lookup_failed");
    if (!listing || !listing.is_public) return badRequest("Listing not available");

    const { error } = await sc.from("purchase_intents").insert({
      listing_id: parsed.listing_id,
      buyer_email: parsed.buyer_email ?? null,
      buyer_ip: ip,
      source: parsed.source,
      metadata: parsed.metadata ?? {},
    });
    if (error) return serverError(error, "insert_failed");

    // Also log analytics event (best-effort)
    await sc.from("storefront_events").insert({
      listing_id: parsed.listing_id,
      event_type: "buy_click",
      session_id: null,
      metadata: { source: parsed.source },
    });

    return json({ ok: true });
  } catch (e) { return serverError(e); }
});
