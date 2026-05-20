// Creator payout profile — GET/POST own profile. Never accepts Stripe Connect IDs from client.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { preflight, json, badRequest, serverError, requireUser, validateBody, z, serviceClient } from "../_shared/http.ts";

const Body = z.object({
  payout_method: z.enum(["unset", "manual"]).optional(), // 'stripe_connect' reserved
  payout_email: z.string().email().max(254).nullable().optional(),
  country_code: z.string().length(2).nullable().optional(),
});

serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const sc = serviceClient();

  if (req.method === "GET") {
    const { data, error } = await sc.from("creator_payout_profiles")
      .select("*").eq("user_id", auth.userId).maybeSingle();
    if (error) return serverError(error);
    return json({ profile: data ?? null });
  }

  if (req.method !== "POST") return badRequest("GET or POST only");
  const parsed = await validateBody(req, Body);
  if (parsed instanceof Response) return parsed;

  try {
    const payload: Record<string, unknown> = { user_id: auth.userId };
    if (parsed.payout_method !== undefined) payload.payout_method = parsed.payout_method;
    if (parsed.payout_email !== undefined) payload.payout_email = parsed.payout_email;
    if (parsed.country_code !== undefined) payload.country_code = parsed.country_code?.toUpperCase() ?? null;
    payload.updated_at = new Date().toISOString();

    const { data, error } = await sc.from("creator_payout_profiles")
      .upsert(payload, { onConflict: "user_id" })
      .select("*").maybeSingle();
    if (error) return serverError(error);
    return json({ profile: data });
  } catch (e) { return serverError(e); }
});
