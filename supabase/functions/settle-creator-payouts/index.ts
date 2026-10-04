// Admin-triggered creator payout settlement.
//
// This function never mutates creator_earnings_ledger. It asks the database for
// an atomic payout reservation, then creates one idempotent Stripe transfer to
// the creator's verified Connect account. A retry reuses the same reservation
// and Stripe idempotency key if the prior response was interrupted after money
// moved but before the database acknowledged it.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import {
  json, badRequest, forbidden, serverError,
  requireUser, validateBody, z, serviceClient,
} from "../_shared/http.ts";
import { adminOriginGuard, withAdminOriginAllowList } from "../_shared/admin-cors.ts";
import { correlationId, logFinancialEvent } from "../_shared/observability.ts";
import {
  externalPaymentWritesEnabled,
  marketplacePayoutsEnabled,
} from "../_shared/ga-release-flags.ts";

const Body = z.object({
  creator_user_id: z.string().uuid().optional(),
  currency: z.string().length(3).regex(/^[A-Za-z]{3}$/).optional(),
  minimum_cents: z.number().int().min(1).max(1_000_000).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

type PayoutReservation = {
  ok?: boolean;
  reused?: boolean;
  reason?: string;
  payout_transfer_id?: string;
  creator_user_id?: string;
  stripe_connect_account_id?: string;
  currency?: string;
  amount_cents?: number;
  idempotency_key?: string;
};

type BalanceRow = {
  currency?: string;
  payable_cents?: number;
  reserved_cents?: number;
};

type CandidateRow = {
  creator_user_id?: string;
};

type StripeTransferError = {
  type?: string;
  code?: string;
  statusCode?: number;
};

function isDefinitiveTransferRejection(error: unknown): boolean {
  const candidate = error as StripeTransferError;
  return [
    "StripeInvalidRequestError",
    "StripeAuthenticationError",
    "StripePermissionError",
    "StripeCardError",
  ].includes(candidate?.type ?? "");
}

serve(async (req) => {
  const originGate = adminOriginGuard(req);
  if (originGate) return withAdminOriginAllowList(req, originGate);

  const response = await (async () => {
    if (req.method !== "POST") return badRequest("POST only");

    if (!externalPaymentWritesEnabled()) {
      return json({
        error: "External payment writes are disabled.",
        code: "ga_payments_disabled",
      }, 503);
    }
    if (!marketplacePayoutsEnabled()) {
      return json({
        error: "Creator payouts are disabled until payout lifecycle validation is complete.",
        code: "ga_marketplace_payouts_disabled",
      }, 503);
    }

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

    const body = await validateBody(req, Body);
    if (body instanceof Response) return body;

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) return serverError(new Error("STRIPE_SECRET_KEY missing"));
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const corr = correlationId(req);
    const minimumCents = body.minimum_cents ?? 100;
    const limit = body.limit ?? 25;

    let creatorIds: string[] = [];
    if (body.creator_user_id) {
      creatorIds = [body.creator_user_id];
    } else {
      // Ask the database for actual payout work, rather than repeatedly
      // scanning the first page of verified profiles. The candidate RPC also
      // includes active reservations whose payable balance is now zero, so a
      // Stripe-success/DB-acknowledgement failure is retried automatically.
      const { data: candidates, error: candidateError } = await sc.rpc(
        "list_creator_payout_candidates",
        {
          _minimum_cents: minimumCents,
          _limit: limit,
        },
      );
      if (candidateError) return serverError(candidateError, "payout_candidate_query_failed");
      creatorIds = [...new Set(
        ((candidates ?? []) as CandidateRow[])
          .map((row) => String(row.creator_user_id ?? ""))
          .filter((value) => value.length > 0),
      )];
    }

    const results: Array<Record<string, unknown>> = [];

    for (const creatorUserId of creatorIds) {
      let currencies: string[] = [];
      if (body.currency) {
        currencies = [body.currency.toLowerCase()];
      } else {
        const { data: balanceRows, error: balanceError } = await sc.rpc(
          "get_creator_payout_balance",
          { _creator_user_id: creatorUserId },
        );
        if (balanceError) {
          results.push({
            creator_user_id: creatorUserId,
            ok: false,
            stage: "balance",
            error: balanceError.message,
          });
          continue;
        }
        currencies = ((balanceRows ?? []) as BalanceRow[])
          .filter((row) =>
            Number(row.reserved_cents ?? 0) > 0
            || Number(row.payable_cents ?? 0) >= minimumCents
          )
          .map((row) => String(row.currency ?? "").toLowerCase())
          .filter((currency) => currency.length === 3);
      }

      for (const currency of [...new Set(currencies)]) {
        const { data: reservationData, error: reservationError } = await sc.rpc(
          "reserve_creator_payout",
          {
            _creator_user_id: creatorUserId,
            _currency: currency,
            _minimum_cents: minimumCents,
          },
        );

        if (reservationError) {
          results.push({
            creator_user_id: creatorUserId,
            currency,
            ok: false,
            stage: "reserve",
            error: reservationError.message,
          });
          continue;
        }

        const reservation = (reservationData ?? {}) as PayoutReservation;
        if (reservation.ok !== true) {
          results.push({
            creator_user_id: creatorUserId,
            currency,
            ok: true,
            transferred: false,
            reason: reservation.reason ?? "no_payable_balance",
            amount_cents: reservation.amount_cents ?? 0,
          });
          continue;
        }

        if (
          !reservation.payout_transfer_id ||
          !reservation.stripe_connect_account_id ||
          !reservation.idempotency_key ||
          !reservation.currency ||
          !Number.isInteger(Number(reservation.amount_cents)) ||
          Number(reservation.amount_cents) <= 0
        ) {
          results.push({
            creator_user_id: creatorUserId,
            currency,
            ok: false,
            stage: "reserve",
            error: "Payout reservation was malformed",
          });
          continue;
        }

        try {
          const transfer = await stripe.transfers.create({
            amount: Number(reservation.amount_cents),
            currency: reservation.currency,
            destination: reservation.stripe_connect_account_id,
            transfer_group: `scrolllibrary_creator_payout:${creatorUserId}`,
            metadata: {
              creator_user_id: creatorUserId,
              payout_transfer_id: reservation.payout_transfer_id,
              correlation_id: corr,
            },
          }, {
            idempotencyKey: reservation.idempotency_key,
          });

          const { data: markData, error: markError } = await sc.rpc(
            "mark_creator_payout_transferred",
            {
              _payout_transfer_id: reservation.payout_transfer_id,
              _stripe_transfer_id: transfer.id,
            },
          );
          if (markError) {
            // Do not mark the reservation failed: Stripe already moved funds.
            // The next invocation reuses the same reservation and idempotency
            // key, allowing Stripe to return the same transfer for recovery.
            throw new Error(`Stripe transfer succeeded but acknowledgement failed: ${markError.message}`);
          }

          await logFinancialEvent(sc, {
            event_type: "creator_payout_transferred",
            severity: "info",
            actor: "admin",
            correlation_id: corr,
            user_id: creatorUserId,
            payload: {
              payout_transfer_id: reservation.payout_transfer_id,
              stripe_transfer_id: transfer.id,
              amount_cents: reservation.amount_cents,
              currency: reservation.currency,
              reservation_reused: reservation.reused === true,
              db_result: markData,
            },
          });

          results.push({
            creator_user_id: creatorUserId,
            currency: reservation.currency,
            ok: true,
            transferred: true,
            payout_transfer_id: reservation.payout_transfer_id,
            stripe_transfer_id: transfer.id,
            amount_cents: reservation.amount_cents,
            reused: reservation.reused === true,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const stripeSucceededButDbFailed = message.startsWith(
            "Stripe transfer succeeded but acknowledgement failed:",
          );
          const definitiveRejection =
            !stripeSucceededButDbFailed && isDefinitiveTransferRejection(error);

          // Transport errors, Stripe 5xx/API errors, timeouts, and local
          // acknowledgement failures are ambiguous: Stripe may already have
          // created the transfer. Preserve the active reservation so the next
          // invocation retries the SAME idempotency key. Only an explicit
          // Stripe rejection may release the ledger allocation.
          if (definitiveRejection) {
            const stripeError = error as StripeTransferError;
            const { error: failError } = await sc.rpc(
              "mark_creator_payout_failed",
              {
                _payout_transfer_id: reservation.payout_transfer_id,
                _failure_code: stripeError.code ?? stripeError.type ?? "stripe_transfer_rejected",
                _failure_message: message,
              },
            );
            if (failError) {
              await logFinancialEvent(sc, {
                event_type: "creator_payout_failure_persist_failed",
                severity: "critical",
                actor: "admin",
                correlation_id: corr,
                user_id: creatorUserId,
                payload: {
                  payout_transfer_id: reservation.payout_transfer_id,
                  transfer_error: message,
                  persistence_error: failError.message,
                },
                dead_letter_reason: "payout_failure_state_not_persisted",
              });
            }
          }

          const ambiguous = !definitiveRejection;
          await logFinancialEvent(sc, {
            event_type: stripeSucceededButDbFailed
              ? "creator_payout_acknowledgement_failed"
              : ambiguous
                ? "creator_payout_transfer_ambiguous"
                : "creator_payout_transfer_rejected",
            severity: ambiguous ? "critical" : "error",
            actor: "admin",
            correlation_id: corr,
            user_id: creatorUserId,
            payload: {
              payout_transfer_id: reservation.payout_transfer_id,
              amount_cents: reservation.amount_cents,
              currency: reservation.currency,
              error: message,
              reservation_preserved: ambiguous,
            },
            dead_letter_reason: stripeSucceededButDbFailed
              ? "stripe_moved_money_db_ack_failed"
              : ambiguous
                ? "stripe_transfer_outcome_ambiguous"
                : "stripe_transfer_rejected",
          });

          results.push({
            creator_user_id: creatorUserId,
            currency: reservation.currency,
            ok: false,
            transferred: false,
            payout_transfer_id: reservation.payout_transfer_id,
            amount_cents: reservation.amount_cents,
            error: message,
            recoverable_idempotently: ambiguous,
            reservation_preserved: ambiguous,
          });
        }
      }
    }

    const transferred = results.filter((row) => row.transferred === true);
    const failed = results.filter((row) => row.ok === false);

    return json({
      ok: failed.length === 0,
      correlation_id: corr,
      creators_scanned: creatorIds.length,
      transfers_created: transferred.length,
      amount_cents_by_currency: transferred.reduce<Record<string, number>>((acc, row) => {
        const currency = String(row.currency ?? "").toLowerCase();
        acc[currency] = (acc[currency] ?? 0) + Number(row.amount_cents ?? 0);
        return acc;
      }, {}),
      failures: failed.length,
      results,
    }, failed.length > 0 ? 207 : 200);
  })();

  return withAdminOriginAllowList(req, response);
});
