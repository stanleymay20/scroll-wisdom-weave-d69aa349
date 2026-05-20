// Phase 2.1d — First-touch attribution capture.
// Anonymous-callable; persists only first-touch UTM/referrer per session_id.
// Updates last_seen_at + bumps events_count on subsequent calls without
// overwriting first-touch fields. Optionally links user_id once known.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  preflight, json, badRequest, serverError,
  validateBody, z, serviceClient,
} from "../_shared/http.ts";
import { correlationId } from "../_shared/observability.ts";

const Body = z.object({
  session_id: z.string().min(8).max(128),
  user_id: z.string().uuid().optional().nullable(),
  source: z.string().max(120).optional(),
  medium: z.string().max(60).optional(),
  campaign: z.string().max(120).optional(),
  term: z.string().max(120).optional(),
  content: z.string().max(120).optional(),
  referrer: z.string().max(500).optional(),
  landing_path: z.string().max(500).optional(),
  user_agent_family: z.string().max(60).optional(),
});

async function hashIp(ip: string | null): Promise<string | null> {
  if (!ip) return null;
  const data = new TextEncoder().encode(`${ip}:scrolllibrary-salt`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).slice(0, 16).map(b => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== "POST") return badRequest("POST only");

  const parsed = await validateBody(req, Body);
  if (parsed instanceof Response) return parsed;

  const corr = correlationId(req);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ipHash = await hashIp(ip);
  const country = req.headers.get("cf-ipcountry") ?? req.headers.get("x-vercel-ip-country") ?? null;

  try {
    const sc = serviceClient();
    const { data: existing } = await sc.from("attribution_sessions")
      .select("id, user_id, events_count").eq("session_id", parsed.session_id).maybeSingle();

    if (existing) {
      await sc.from("attribution_sessions").update({
        last_seen_at: new Date().toISOString(),
        events_count: (existing.events_count ?? 0) + 1,
        // Only set user_id if it was unknown and now is known.
        ...(existing.user_id ? {} : (parsed.user_id ? { user_id: parsed.user_id } : {})),
      }).eq("session_id", parsed.session_id);
      return json({ ok: true, session_id: parsed.session_id, first_touch: false });
    }

    await sc.from("attribution_sessions").insert({
      session_id: parsed.session_id,
      user_id: parsed.user_id ?? null,
      first_touch_source: parsed.source ?? "direct",
      first_touch_medium: parsed.medium ?? null,
      first_touch_campaign: parsed.campaign ?? null,
      first_touch_referrer: parsed.referrer ?? null,
      first_touch_landing_path: parsed.landing_path ?? null,
      utm_term: parsed.term ?? null,
      utm_content: parsed.content ?? null,
      ip_hash: ipHash,
      country_code: country,
      user_agent_family: parsed.user_agent_family ?? null,
      events_count: 1,
      metadata: { correlation_id: corr },
    });

    return json({ ok: true, session_id: parsed.session_id, first_touch: true });
  } catch (e) { return serverError(e); }
});
