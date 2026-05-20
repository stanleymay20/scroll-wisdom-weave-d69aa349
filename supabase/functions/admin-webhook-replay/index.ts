// Admin-only: replay a previously-received Stripe webhook event.
// Useful when downstream side effects failed and we need to re-run the handler
// with the original payload (idempotency keys protect duplicate side effects).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import {
  preflight, json, badRequest, unauthorized, forbidden, serverError,
  requireUser, validateBody, z, serviceClient,
} from "../_shared/http.ts";
import { correlationId, logFinancialEvent } from "../_shared/observability.ts";

const Body = z.object({
  stripe_event_id: z.string().min(1),
  force: z.boolean().optional(),
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

    if (existing.status === "processed" && !parsed.force) {
      return json({ ok: false, reason: "already_processed", hint: "pass force=true to replay anyway" });
    }

    // Mark replaying
    await sc.from("stripe_webhook_events").update({
      status: "processing",
      attempts: (existing.attempts ?? 0) + 1,
      updated_at: new Date().toISOString(),
    }).eq("stripe_event_id", parsed.stripe_event_id);

    await logFinancialEvent(sc, {
      event_type: "webhook_replay_started", severity: "warn", actor: "admin",
      correlation_id: corr, stripe_event_id: parsed.stripe_event_id, user_id: auth.userId,
      payload: { event_type: existing.event_type, force: parsed.force ?? false },
    });

    // Re-dispatch payload to stripe-webhook by re-signing with the webhook secret.
    // We sign the raw payload so the existing verification path passes.
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")!;
    const whSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const payloadStr = JSON.stringify(existing.payload);
    const timestamp = Math.floor(Date.now() / 1000);
    const signedPayload = `${timestamp}.${payloadStr}`;
    // Use stripe's signing utility via webhook constructEventAsync would require a real signature;
    // for replay we directly invoke the side-effect path by calling the RPC for the purchase if applicable.
    // Simpler & safer: rebuild stripe signature using their helper.
    // deno-lint-ignore no-explicit-any
    const sig = (stripe.webhooks as any).generateTestHeaderString
      ? // deno-lint-ignore no-explicit-any
        (stripe.webhooks as any).generateTestHeaderString({ payload: payloadStr, secret: whSecret, timestamp })
      : null;

    if (!sig) {
      // Mark replayed but skip remote dispatch
      await sc.from("stripe_webhook_events").update({
        status: "replayed", processed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq("stripe_event_id", parsed.stripe_event_id);
      return json({ ok: true, dispatched: false, reason: "signature_helper_unavailable" });
    }

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
    }).eq("stripe_event_id", parsed.stripe_event_id);

    await logFinancialEvent(sc, {
      event_type: "webhook_replay_finished", severity: res.ok ? "info" : "error", actor: "admin",
      correlation_id: corr, stripe_event_id: parsed.stripe_event_id, user_id: auth.userId,
      payload: { http_status: res.status },
    });

    return json({ ok: res.ok, http_status: res.status, correlation_id: corr });
  } catch (e) { return serverError(e); }
});
