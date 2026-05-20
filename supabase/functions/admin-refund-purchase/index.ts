// Phase 2.1d — Admin-initiated refund workflow.
// Creates a refund_requests row, calls Stripe refunds.create with idempotency,
// flips book_purchases.status='refunded' (which triggers record_purchase_ledger
// to write the refund ledger pair), emits financial_events.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import {
  preflight, json, badRequest, forbidden, serverError,
  requireUser, validateBody, z, serviceClient,
} from "../_shared/http.ts";
import { correlationId, logFinancialEvent } from "../_shared/observability.ts";

const Body = z.object({
  purchase_id: z.string().uuid(),
  reason: z.enum(["duplicate", "fraudulent", "requested_by_customer"]).optional(),
  amount_cents: z.number().int().positive().optional(),
  note: z.string().max(500).optional(),
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
    const { data: purchase } = await sc.from("book_purchases")
      .select("id, book_id, buyer_user_id, amount_cents, currency, status, stripe_payment_intent")
      .eq("id", parsed.purchase_id).maybeSingle();
    if (!purchase) return badRequest("Purchase not found");
    if (purchase.status === "refunded") return badRequest("Already refunded");
    if (!purchase.stripe_payment_intent) return badRequest("No payment intent on purchase");

    const { data: book } = await sc.from("books").select("user_id").eq("id", purchase.book_id).maybeSingle();
    const refundAmount = parsed.amount_cents ?? purchase.amount_cents;

    // 1) Persist refund request first so we have an audit trail even if Stripe fails.
    const { data: reqRow, error: reqErr } = await sc.from("refund_requests").insert({
      purchase_id: purchase.id,
      book_id: purchase.book_id,
      buyer_user_id: purchase.buyer_user_id,
      creator_user_id: book?.user_id ?? null,
      requested_by: auth.userId,
      requested_role: "admin",
      status: "processing",
      reason: parsed.reason ?? "requested_by_customer",
      amount_cents: refundAmount,
      currency: purchase.currency,
      stripe_payment_intent: purchase.stripe_payment_intent,
      correlation_id: corr,
      metadata: { note: parsed.note ?? null },
    }).select("id").single();
    if (reqErr || !reqRow) return serverError(reqErr ?? new Error("refund_requests insert failed"));

    await logFinancialEvent(sc, {
      event_type: "refund_requested", severity: "info", actor: "admin",
      correlation_id: corr, purchase_id: purchase.id, user_id: auth.userId,
      payload: { refund_request_id: reqRow.id, amount_cents: refundAmount, reason: parsed.reason },
    });

    // 2) Call Stripe with an idempotency key derived from purchase + amount.
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) return serverError(new Error("STRIPE_SECRET_KEY missing"));
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    try {
      const refund = await stripe.refunds.create({
        payment_intent: purchase.stripe_payment_intent,
        amount: refundAmount,
        reason: parsed.reason ?? "requested_by_customer",
        metadata: { purchase_id: purchase.id, refund_request_id: reqRow.id, correlation_id: corr },
      }, { idempotencyKey: `refund:${purchase.id}:${refundAmount}` });

      // 3) Flip purchase status — webhook charge.refunded will also fire, but
      // record_purchase_ledger is idempotent via UNIQUE(purchase_id, entry_type).
      await sc.from("book_purchases")
        .update({ status: "refunded", correlation_id: corr })
        .eq("id", purchase.id);

      const { error: ledgerErr } = await sc.rpc("record_purchase_ledger", { _purchase_id: purchase.id });
      if (ledgerErr) {
        await logFinancialEvent(sc, {
          event_type: "ledger_write_failed", severity: "error", actor: "admin",
          correlation_id: corr, purchase_id: purchase.id,
          payload: { source: "admin_refund", error: ledgerErr.message },
          dead_letter_reason: "refund_ledger_write_failed",
        });
      }

      await sc.from("refund_requests").update({
        status: "processed", stripe_refund_id: refund.id,
        processed_at: new Date().toISOString(), processed_by: auth.userId,
      }).eq("id", reqRow.id);

      await logFinancialEvent(sc, {
        event_type: "refund_processed", severity: "warn", actor: "admin",
        correlation_id: corr, purchase_id: purchase.id, user_id: auth.userId,
        payload: { refund_id: refund.id, amount_cents: refundAmount, refund_request_id: reqRow.id },
      });

      return json({ ok: true, refund_id: refund.id, refund_request_id: reqRow.id, correlation_id: corr });
    } catch (stripeErr) {
      const msg = stripeErr instanceof Error ? stripeErr.message : String(stripeErr);
      await sc.from("refund_requests").update({
        status: "failed", error_message: msg, processed_at: new Date().toISOString(),
      }).eq("id", reqRow.id);
      await logFinancialEvent(sc, {
        event_type: "refund_failed", severity: "error", actor: "admin",
        correlation_id: corr, purchase_id: purchase.id, user_id: auth.userId,
        payload: { error: msg, refund_request_id: reqRow.id },
        dead_letter_reason: "stripe_refund_call_failed",
      });
      return json({ ok: false, error: msg, refund_request_id: reqRow.id }, 502);
    }
  } catch (e) { return serverError(e); }
});
