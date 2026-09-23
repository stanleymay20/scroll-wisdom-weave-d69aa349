// One-shot admin maintenance tool.
//
// It can safely reconstruct missing SALE rows from book_purchases. It does not
// synthesize refund rows because the current append-only refund model requires
// the original Stripe refund ID and amount for event-level idempotency.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  preflight, json, forbidden, serverError, requireUser, serviceClient,
} from "../_shared/http.ts";

serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  const sc = serviceClient();
  const { data: role, error: roleError } = await sc
    .from("user_roles")
    .select("role")
    .eq("user_id", auth.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (roleError) return serverError(roleError);
  if (!role) return forbidden("admin_only");

  try {
    const { data: purchases, error: purchaseError } = await sc
      .from("book_purchases")
      .select("id,status,amount_cents")
      .in("status", ["paid", "refunded"])
      .limit(5000);
    if (purchaseError) return serverError(purchaseError);

    let saleOk = 0;
    let saleFail = 0;
    let refundDiscrepancies = 0;
    const refundSample: Array<{
      purchase_id: string;
      status: string;
      purchase_cents: number;
      refunded_cents: number;
    }> = [];

    for (const purchase of purchases ?? []) {
      const { data: saleResult, error: saleError } = await sc.rpc(
        "record_purchase_ledger",
        { _purchase_id: purchase.id },
      );
      if (saleError || (saleResult as { ok?: boolean } | null)?.ok !== true) {
        saleFail += 1;
      } else {
        saleOk += 1;
      }

      if (purchase.status !== "refunded") continue;

      const { data: refunds, error: refundError } = await sc
        .from("creator_earnings_ledger")
        .select("gross_cents")
        .eq("purchase_id", purchase.id)
        .eq("entry_type", "refund");
      if (refundError) return serverError(refundError);

      const refundedCents = (refunds ?? []).reduce(
        (sum, row) => sum + Math.max(0, -Number(row.gross_cents ?? 0)),
        0,
      );
      const purchaseCents = Number(purchase.amount_cents ?? 0);
      if (refundedCents !== purchaseCents) {
        refundDiscrepancies += 1;
        if (refundSample.length < 20) {
          refundSample.push({
            purchase_id: purchase.id,
            status: purchase.status,
            purchase_cents: purchaseCents,
            refunded_cents: refundedCents,
          });
        }
      }
    }

    return json({
      scanned: purchases?.length ?? 0,
      sale_rows_reconciled: saleOk,
      sale_failures: saleFail,
      refund_discrepancies: refundDiscrepancies,
      refund_autoheal: false,
      refund_sample: refundSample,
      note: refundDiscrepancies > 0
        ? "Refund rows require Stripe refund-event reconciliation; no synthetic refund was written."
        : null,
    });
  } catch (error) {
    return serverError(error);
  }
});
