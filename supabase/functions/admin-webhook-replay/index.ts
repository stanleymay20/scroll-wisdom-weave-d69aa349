// Admin-only: replay a previously-received Stripe webhook event.
// Useful when downstream side effects failed and we need to re-run the handler
// with the original payload (idempotency keys protect duplicate side effects).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import {
  preflight, json, badRequest, forbidden, serverError,
  requireUser, validateBody, z, serviceClient,
} from "../_shared/http.ts";
import { correlationId, logFinancialEvent } from "../_shared/observability.ts";

const Body = z.object({
  stripe_event_id: z.string().min(1),
  force: z.boolean().optional(),
  reason: z.string().trim().min(12).max(500).optional(),
});

serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== "POST") return badRequest("POST only");

  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  const sc = serviceClient();
  const { data: roleData } = await sc.from("user_roles").select("role").eq("user_id", auth.userId).maybeSingle();
  if (!roleData || roleData.role !== "admin") return forbidden("Admin required");

  const parsed = await validateBody(req, Body);
  if (parsed instanceof Response) return parsed;

  const corr = correlationId(req);

  try {
    const { data: existing } = await sc.from("stripe_webhook_events")
      .select("stripe_event_id, status, payload, event_type, attempts")
      .eq("stripe_event_id", parsed.stripe_event_id).maybeSingle();
    if (!existing) return badRequest("Webhook event not found");

    const priorStatus = String(existing.status ?? "unknown");
    const force = parsed.force === true;

    if (existing.status === "processed" && !force) {
      return json({ ok: false, reason: "already_processed", hint: "pass force=true with reason to replay anyway" });
    }

    if (force && !parsed.reason) {
      return badRequest("Forced replay requires a reason of at least 12 characters");
    }

    if (!["failed", "dead_lettered"].includes(priorStatus) && !force) {
      return json({
        ok: false,
        reason: "not_replayable_status",
        status: priorStatus,
        hint: "Only failed or dead_lettered events can be replayed without force.",
      }, 409);
    }

    // Mark replaying
    await sc.from("stripe_webhook_events").update({
      status: "processing",
      attempts: (existing.attempts ?? 0) + 1,
      updated_at: new Date().toISOString(),
    }).eq("stripe_event_id", parsed.stripe_event_id);

    await logFinancialEvent(sc, {
      event_type: "webhook_replay_started", severity: force ? "critical" : "warn", actor: "admin",
      correlation_id: corr, stripe_event_id: parsed.stripe_event_id, user_id: auth.userId,
      payload: { event_type: existing.event_type, prior_status: priorStatus, force, reason: parsed.reason ?? null },
    });

    const whSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
    const payloadStr = JSON.stringify(existing.payload);
    const timestamp = Math.floor(Date.now() / 1000);
    const signedPayload = `${timestamp}.${payloadStr}`;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(whSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
    const sigHex = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, "0")).join("");
    const sig = `t=${timestamp},v1=${sigHex}`;

    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/stripe-webhook`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": sig,
        "x-correlation-id": corr,
      },
      body: payloadStr,
    });

    const finalStatus = res.ok ? "replayed" : "failed";
    await sc.from("stripe_webhook_events").update({
      status: finalStatus,
      last_error: res.ok ? null : `replay http ${res.status}`,
      processed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...(res.ok ? { dead_letter_reason: null, dead_lettered_at: null } : {}),
    }).eq("stripe_event_id", parsed.stripe_event_id);

    await logFinancialEvent(sc, {
      event_type: "webhook_replay_finished", severity: res.ok ? (force ? "warn" : "info") : "error", actor: "admin",
      correlation_id: corr, stripe_event_id: parsed.stripe_event_id, user_id: auth.userId,
      payload: { http_status: res.status, prior_status: priorStatus, final_status: finalStatus, force, reason: parsed.reason ?? null },
    });

    return json({ ok: res.ok, http_status: res.status, correlation_id: corr });
  } catch (e) { return serverError(e); }
});
