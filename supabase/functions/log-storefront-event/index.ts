import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, preflight, json, badRequest, serverError, serviceClient, validateBody, z, clientIp, enforceRateLimit, enforcePersistentVelocity } from "../_shared/http.ts";

const ALLOWED_EVENTS = [
  "sample_open", "sample_complete", "cta_click", "buy_click", "share_click",
  "kdp_export_started", "kdp_export_completed", "kdp_export_failed",
  "gumroad_export_started", "gumroad_export_completed", "gumroad_export_failed",
  "listing_view", "listing_publish", "listing_unpublish",
  "checkout_started", "checkout_completed", "checkout_failed", "full_book_unlocked",
  "earnings_view", "payout_profile_view", "payout_profile_update",
  "admin_finance_view", "platform_fee_updated",
] as const;

const Body = z.object({
  listing_id: z.string().uuid().optional().nullable(),
  event_type: z.enum(ALLOWED_EVENTS),
  session_id: z.string().max(128).optional(),
  user_id: z.string().uuid().optional().nullable(),
  metadata: z.record(z.any()).optional(),
});

serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== "POST") return badRequest("POST only");

  const ip = clientIp(req);
  const limited = enforceRateLimit({ name: "log-storefront-event", key: ip, limit: 120, windowSec: 60 });
  if (limited) return limited;

  const parsed = await validateBody(req, Body);
  if (parsed instanceof Response) return parsed;

  try {
    const sc = serviceClient();

    // Persistent cross-instance velocity gate (defends against bot floods
    // even after edge-instance churn). Higher cap per session than per IP
    // because legit users may share IPs (corporate NAT, mobile carriers).
    const velIp = await enforcePersistentVelocity(sc, {
      name: "storefront-event:ip", key: ip, limit: 600, windowSec: 60,
    });
    if (velIp) return velIp;
    if (parsed.session_id) {
      const velSession = await enforcePersistentVelocity(sc, {
        name: "storefront-event:session", key: parsed.session_id, limit: 300, windowSec: 60,
      });
      if (velSession) return velSession;
    }

    const { error } = await sc.from("storefront_events").insert({
      listing_id: parsed.listing_id ?? null,
      event_type: parsed.event_type,
      user_id: parsed.user_id ?? null,
      session_id: parsed.session_id ?? null,
      metadata: parsed.metadata ?? {},
    });
    if (error) return serverError(error, "insert_failed");
    return json({ ok: true });
  } catch (e) { return serverError(e); }
});
