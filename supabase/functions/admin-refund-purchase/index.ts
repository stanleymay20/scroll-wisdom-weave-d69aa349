// Admin-initiated refund workflow.
//
// Money invariants:
// - every request requires an explicit idempotency key;
// - partial refunds keep the purchase paid until cumulative refunds reach 100%;
// - Stripe refund ID is the append-only ledger event identity;
// - retrying the same request can never create a second refund or ledger reversal.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import {
  json, badRequest, forbidden, serverError,
  requireUser, validateBody, z, serviceClient,
} from "../_shared/http.ts";
import { adminOriginGuard, withAdminOriginAllowList } from "../_shared/admin-cors.ts";
import { correlationId, logFinancialEvent } from "../_shared/observability.ts";

const Body = z.object({
  purchase_id: z.string().uuid(),
  reason: z.enum(["duplicate", "fraudulent", "requested_by_customer"]).optional(),
  amount_cents: z.number().int().positive().optional(),
  note: z.string().max(500).optional(),
});

type RefundLedgerResult = {
  ok?: boolean;
  idempotent?: boolean;
  ledger_id?: string;
  refund_event_id?: string;
  refund_amount_cents?: number;
  refunded_total_cents?: number;
  remaining_cents?: number;
  fully_refunded?: boolean;
  reason?: string;
};

const IDEMPOTENCY_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

serve(async (req) => {
  const originGate = adminOriginGuard(req);
  if (originGate) return withAdminOriginAllowList(req, originGate);

  const response = await (async () => {
    if (req.method !== "POST") return badRequest("POST only");

    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;

    const sc = serviceClient();
    const { data: roleData, error: roleError } = await sc
      .from("user_roles")
      .select("role")
      .eq("user_id", auth.userId)
      .maybeSingle();
    if (roleError) return serverError(roleError);
    if (!roleData || roleData.role !== "admin") return forbidden("Admin required");

    const parsed = await validateBody(req, Body);
    if (parsed instanceof Response) return parsed;

    const idempotencyKey = req.headers.get("x-idempotency-key")?.trim() ?? "";
    if (!IDEMPOTENCY_RE.test(idempotencyKey)) {
      return badRequest(
        "x-idempotency-key is required (8-128 letters, numbers, dot, underscore, colon or dash)",
      );
    }

    const corr = correlationId(req);

    try {
      const { data: purchase, error: purchaseError } = await sc
        .from("book_purchases")
        .select("id, book_id, buyer_user_id, amount_cents, currency, status, stripe_payment_intent")
        .eq("id", parsed.purchase_id)
        .maybeSingle();
      if (purchaseError) return serverError(purchaseError);
      if (!purchase) return badRequest("Purchase not found");
      if (!purchase.stripe_payment_intent) return badRequest("No payment intent on purchase");

      const { data: priorRows, error: priorRefundError } = await sc
        .from("creator_earnings_ledger")
        .select("gross_cents")
        .eq("purchase_id", purchase.id)
        .eq("entry_type", "refund");
      if (priorRefundError) return serverError(priorRefundError);

      const alreadyRefunded = (priorRows ?? []).reduce(
        (sum, row) => sum + Math.max(0, -Number(row.gross_cents ?? 0)),
        0,
      );
      const remainingBefore = Math.max(0, Number(purchase.amount_cents ?? 0) - alreadyRefunded);
      if (remainingBefore <= 0 || purchase.status === "refunded") {
        return badRequest("Purchase is already fully refunded");
      }

      const { data: existingRequest, error: existingRequestError } = await sc
        .from("refund_requests")
        .select("id,status,amount_cents,stripe_refund_id,error_message")
        .eq("purchase_id", purchase.id)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (existingRequestError) return serverError(existingRequestError);

      if (
        existingRequest &&
        parsed.amount_cents != null &&
        Number(existingRequest.amount_cents) !== parsed.amount_cents
      ) {
        return json({
          ok: false,
          error: "Idempotency key was already used with a different refund amount",
          code: "idempotency_conflict",
        }, 409);
      }

      if (existingRequest?.status === "processed" && existingRequest.stripe_refund_id) {
        return json({
          ok: true,
          idempotent: true,
          refund_id: existingRequest.stripe_refund_id,
          refund_request_id: existingRequest.id,
          amount_cents: existingRequest.amount_cents,
          correlation_id: corr,
        });
      }

      const refundAmount = existingRequest
        ? Number(existingRequest.amount_cents)
        : (parsed.amount_cents ?? remainingBefore);

      if (!Number.isInteger(refundAmount) || refundAmount <= 0) {
        return badRequest("Refund amount must be a positive integer number of cents");
      }
      if (refundAmount > remainingBefore) {
        return badRequest(
          `Refund exceeds remaining refundable balance of ${remainingBefore} cents`,
        );
      }

      const { data: book, error: bookError } = await sc
        .from("books")
        .select("user_id")
        .eq("id", purchase.book_id)
        .maybeSingle();
      if (bookError) return serverError(bookError);

      let requestRow = existingRequest;
      if (!requestRow) {
        const { data: inserted, error: insertError } = await sc
          .from("refund_requests")
          .insert({
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
            idempotency_key: idempotencyKey,
            metadata: { note: parsed.note ?? null },
          })
          .select("id,status,amount_cents,stripe_refund_id,error_message")
          .single();

        if (insertError) {
          // A concurrent request can win the unique idempotency-key insert.
          // Read that winner instead of issuing another refund.
          if (insertError.code !== "23505") return serverError(insertError);
          const { data: winner, error: winnerError } = await sc
            .from("refund_requests")
            .select("id,status,amount_cents,stripe_refund_id,error_message")
            .eq("purchase_id", purchase.id)
            .eq("idempotency_key", idempotencyKey)
            .maybeSingle();
          if (winnerError || !winner) {
            return serverError(winnerError ?? new Error("Idempotent refund request disappeared"));
          }
          requestRow = winner;
        } else {
          requestRow = inserted;
        }
      }

      if (!requestRow) return serverError(new Error("Refund request was not persisted"));

      const { error: processingError } = await sc
        .from("refund_requests")
        .update({
          status: "processing",
          error_message: null,
          correlation_id: corr,
        })
        .eq("id", requestRow.id);
      if (processingError) return serverError(processingError);

      await logFinancialEvent(sc, {
        event_type: "refund_requested",
        severity: "info",
        actor: "admin",
        correlation_id: corr,
        purchase_id: purchase.id,
        user_id: auth.userId,
        payload: {
          refund_request_id: requestRow.id,
          amount_cents: refundAmount,
          reason: parsed.reason,
          idempotency_key: idempotencyKey,
        },
      });

      const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
      if (!stripeKey) return serverError(new Error("STRIPE_SECRET_KEY missing"));
      const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

      let refund: Stripe.Refund;
      try {
        if (requestRow.stripe_refund_id) {
          refund = await stripe.refunds.retrieve(requestRow.stripe_refund_id);
        } else {
          refund = await stripe.refunds.create({
            payment_intent: purchase.stripe_payment_intent,
            amount: refundAmount,
            reason: parsed.reason ?? "requested_by_customer",
            metadata: {
              purchase_id: purchase.id,
              refund_request_id: requestRow.id,
              correlation_id: corr,
            },
          }, {
            idempotencyKey: `refund:${purchase.id}:${idempotencyKey}`.slice(0, 255),
          });

          const { error: refundIdError } = await sc
            .from("refund_requests")
            .update({ stripe_refund_id: refund.id })
            .eq("id", requestRow.id);
          if (refundIdError) {
            // Stripe already moved money. Return failure so the same idempotency
            // key is retried and Stripe returns the same refund object.
            throw new Error(`Stripe refund persisted but refund ID write failed: ${refundIdError.message}`);
          }
        }
      } catch (stripeError) {
        const msg = stripeError instanceof Error ? stripeError.message : String(stripeError);
        const { error: failedWriteError } = await sc
          .from("refund_requests")
          .update({
            status: "failed",
            error_message: msg,
            processed_at: new Date().toISOString(),
          })
          .eq("id", requestRow.id);
        if (failedWriteError) return serverError(failedWriteError);

        await logFinancialEvent(sc, {
          event_type: "refund_failed",
          severity: "error",
          actor: "admin",
          correlation_id: corr,
          purchase_id: purchase.id,
          user_id: auth.userId,
          payload: { error: msg, refund_request_id: requestRow.id },
          dead_letter_reason: "stripe_refund_call_failed",
        });
        return json({
          ok: false,
          error: msg,
          refund_request_id: requestRow.id,
          correlation_id: corr,
        }, 502);
      }

      // Some payment methods create a pending refund. Do not reverse earnings
      // until Stripe confirms success; refund.updated/charge.refunded will finish it.
      if (refund.status !== "succeeded") {
        const terminalFailure = refund.status === "failed" || refund.status === "canceled";
        const { error: pendingWriteError } = await sc
          .from("refund_requests")
          .update({
            status: terminalFailure ? "failed" : "processing",
            stripe_refund_id: refund.id,
            error_message: terminalFailure
              ? `Stripe refund status: ${refund.status}`
              : null,
            ...(terminalFailure ? { processed_at: new Date().toISOString() } : {}),
          })
          .eq("id", requestRow.id);
        if (pendingWriteError) return serverError(pendingWriteError);

        return json({
          ok: !terminalFailure,
          pending: !terminalFailure,
          refund_id: refund.id,
          stripe_status: refund.status,
          refund_request_id: requestRow.id,
          amount_cents: refund.amount,
          correlation_id: corr,
        }, terminalFailure ? 502 : 202);
      }

      const { data: ledgerData, error: ledgerError } = await sc.rpc(
        "record_purchase_refund_ledger",
        {
          _purchase_id: purchase.id,
          _refund_event_id: refund.id,
          _refund_amount_cents: refund.amount,
        },
      );
      if (ledgerError) {
        const msg = `Refund ledger write failed: ${ledgerError.message}`;
        const { error: ledgerStateError } = await sc
          .from("refund_requests")
          .update({ status: "failed", error_message: msg })
          .eq("id", requestRow.id);
        if (ledgerStateError) return serverError(ledgerStateError);

        await logFinancialEvent(sc, {
          event_type: "ledger_write_failed",
          severity: "error",
          actor: "admin",
          correlation_id: corr,
          purchase_id: purchase.id,
          payload: {
            source: "admin_refund",
            refund_id: refund.id,
            error: ledgerError.message,
          },
          dead_letter_reason: "refund_ledger_write_failed",
        });
        return json({
          ok: false,
          error: msg,
          refund_id: refund.id,
          refund_request_id: requestRow.id,
          correlation_id: corr,
        }, 502);
      }

      const ledger = (ledgerData ?? {}) as RefundLedgerResult;
      if (ledger.ok !== true) {
        return serverError(new Error(
          `Refund ledger rejected event: ${ledger.reason ?? "unknown"}`,
        ));
      }

      const { error: processedError } = await sc
        .from("refund_requests")
        .update({
          status: "processed",
          stripe_refund_id: refund.id,
          processed_at: new Date().toISOString(),
          processed_by: auth.userId,
          error_message: null,
        })
        .eq("id", requestRow.id);
      if (processedError) return serverError(processedError);

      await logFinancialEvent(sc, {
        event_type: "refund_processed",
        severity: "warn",
        actor: "admin",
        correlation_id: corr,
        purchase_id: purchase.id,
        user_id: auth.userId,
        payload: {
          refund_id: refund.id,
          amount_cents: refund.amount,
          refund_request_id: requestRow.id,
          fully_refunded: ledger.fully_refunded === true,
          refunded_total_cents: ledger.refunded_total_cents ?? null,
          remaining_cents: ledger.remaining_cents ?? null,
        },
      });

      return json({
        ok: true,
        idempotent: ledger.idempotent === true,
        refund_id: refund.id,
        refund_request_id: requestRow.id,
        amount_cents: refund.amount,
        fully_refunded: ledger.fully_refunded === true,
        refunded_total_cents: ledger.refunded_total_cents ?? null,
        remaining_cents: ledger.remaining_cents ?? null,
        correlation_id: corr,
      });
    } catch (error) {
      return serverError(error);
    }
  })();

  return withAdminOriginAllowList(req, response);
});
