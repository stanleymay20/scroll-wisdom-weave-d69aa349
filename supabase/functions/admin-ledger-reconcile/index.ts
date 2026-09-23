// Admin-only: scan recent purchases against the append-only earnings ledger.
// Sale rows can be auto-healed. Refund discrepancies are reported, not guessed:
// reconstructing a refund without the original Stripe refund ID would destroy
// event-level idempotency.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  preflight, json, badRequest, forbidden, serverError,
  requireUser, validateQuery, z, serviceClient,
} from "../_shared/http.ts";
import { correlationId, logFinancialEvent, evaluateSeverity } from "../_shared/observability.ts";

const Query = z.object({
  lookback_hours: z.string().regex(/^\d+$/).optional(),
});

type Discrepancy = {
  purchase_id: string;
  kind: "sale_missing" | "refund_missing" | "refund_total_mismatch" | "refund_exceeds_purchase" | "status_mismatch";
  status: string;
  purchase_cents: number;
  refunded_cents: number;
};

serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== "GET" && req.method !== "POST") return badRequest("GET or POST");

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

  const q = validateQuery(req, Query);
  if (q instanceof Response) return q;

  const hours = Math.min(Math.max(parseInt(q.lookback_hours ?? "24", 10), 1), 720);
  const sinceIso = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  const corr = correlationId(req);

  try {
    const { data: purchases, error: purchaseError } = await sc
      .from("book_purchases")
      .select("id,status,amount_cents,buyer_user_id,book_id,purchased_at")
      .in("status", ["paid", "refunded"])
      .gte("purchased_at", sinceIso)
      .limit(1000);
    if (purchaseError) return serverError(purchaseError);

    const discrepancies: Discrepancy[] = [];

    for (const purchase of purchases ?? []) {
      const { data: entries, error: ledgerError } = await sc
        .from("creator_earnings_ledger")
        .select("entry_type,gross_cents,source_event_id")
        .eq("purchase_id", purchase.id);
      if (ledgerError) return serverError(ledgerError);

      const rows = entries ?? [];
      const hasSale = rows.some((entry) => entry.entry_type === "sale");
      const refundRows = rows.filter((entry) => entry.entry_type === "refund");
      const refundedCents = refundRows.reduce(
        (sum, entry) => sum + Math.max(0, -Number(entry.gross_cents ?? 0)),
        0,
      );
      const purchaseCents = Number(purchase.amount_cents ?? 0);

      if (!hasSale) {
        discrepancies.push({
          purchase_id: purchase.id,
          kind: "sale_missing",
          status: purchase.status,
          purchase_cents: purchaseCents,
          refunded_cents: refundedCents,
        });
      }

      if (refundedCents > purchaseCents) {
        discrepancies.push({
          purchase_id: purchase.id,
          kind: "refund_exceeds_purchase",
          status: purchase.status,
          purchase_cents: purchaseCents,
          refunded_cents: refundedCents,
        });
      }

      if (purchase.status === "refunded") {
        if (refundRows.length === 0) {
          discrepancies.push({
            purchase_id: purchase.id,
            kind: "refund_missing",
            status: purchase.status,
            purchase_cents: purchaseCents,
            refunded_cents: 0,
          });
        } else if (refundedCents !== purchaseCents) {
          discrepancies.push({
            purchase_id: purchase.id,
            kind: "refund_total_mismatch",
            status: purchase.status,
            purchase_cents: purchaseCents,
            refunded_cents: refundedCents,
          });
        }
      } else if (purchase.status === "paid" && purchaseCents > 0 && refundedCents >= purchaseCents) {
        discrepancies.push({
          purchase_id: purchase.id,
          kind: "status_mismatch",
          status: purchase.status,
          purchase_cents: purchaseCents,
          refunded_cents: refundedCents,
        });
      }
    }

    const severity = await evaluateSeverity(sc, "ledger.discrepancies", discrepancies.length);

    await logFinancialEvent(sc, {
      event_type: discrepancies.length > 0 ? "ledger_discrepancy" : "ledger_reconcile_ok",
      severity,
      actor: "admin",
      correlation_id: corr,
      user_id: auth.userId,
      payload: {
        lookback_hours: hours,
        scanned: purchases?.length ?? 0,
        discrepancies_count: discrepancies.length,
        first_10: discrepancies.slice(0, 10),
      },
    });

    // Sale rows are reconstructible from the purchase snapshot. Refund rows are
    // not: they need a concrete Stripe refund event ID and amount.
    let healedSales = 0;
    let saleHealFailures = 0;
    const saleMissingIds = [...new Set(
      discrepancies
        .filter((item) => item.kind === "sale_missing")
        .map((item) => item.purchase_id),
    )];

    for (const purchaseId of saleMissingIds) {
      const { data, error } = await sc.rpc("record_purchase_ledger", {
        _purchase_id: purchaseId,
      });
      if (error || (data as { ok?: boolean } | null)?.ok !== true) {
        saleHealFailures += 1;
      } else {
        healedSales += 1;
      }
    }

    const refundDiscrepancies = discrepancies.filter(
      (item) => item.kind !== "sale_missing",
    ).length;

    return json({
      ok: saleHealFailures === 0,
      correlation_id: corr,
      scanned: purchases?.length ?? 0,
      discrepancies: discrepancies.length,
      healed_sales: healedSales,
      sale_heal_failures: saleHealFailures,
      refund_discrepancies: refundDiscrepancies,
      refund_autoheal: false,
      severity,
      sample: discrepancies.slice(0, 20),
    });
  } catch (error) {
    return serverError(error);
  }
});
