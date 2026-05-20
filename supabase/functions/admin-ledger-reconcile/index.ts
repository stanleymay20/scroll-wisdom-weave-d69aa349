// Admin-only: scan recent book_purchases vs creator_earnings_ledger
// and emit financial_events for discrepancies. Safe to run on a cron.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  preflight, json, badRequest, forbidden, serverError,
  requireUser, validateQuery, z, serviceClient,
} from "../_shared/http.ts";
import { correlationId, logFinancialEvent, evaluateSeverity } from "../_shared/observability.ts";

const Query = z.object({
  lookback_hours: z.string().regex(/^\d+$/).optional(),
});

serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== "GET" && req.method !== "POST") return badRequest("GET or POST");

  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  const sc = serviceClient();
  const { data: roleData } = await sc.from("user_roles").select("role").eq("user_id", auth.userId).maybeSingle();
  if (!roleData || roleData.role !== "admin") return forbidden("Admin required");

  const q = validateQuery(req, Query);
  if (q instanceof Response) return q;

  const hours = Math.min(Math.max(parseInt(q.lookback_hours ?? "24", 10), 1), 720);
  const sinceIso = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  const corr = correlationId(req);

  try {
    // Paid purchases in window with no matching 'sale' ledger row, or refunded with no 'refund' row.
    const { data: paid } = await sc.from("book_purchases")
      .select("id, status, amount_cents, buyer_user_id, book_id, purchased_at")
      .in("status", ["paid", "refunded"])
      .gte("purchased_at", sinceIso)
      .limit(1000);

    const discrepancies: Array<{ purchase_id: string; missing: string; status: string }> = [];

    for (const p of paid ?? []) {
      const { data: entries } = await sc.from("creator_earnings_ledger")
        .select("entry_type").eq("purchase_id", p.id);
      const types = new Set((entries ?? []).map((e: any) => e.entry_type));
      if (!types.has("sale")) discrepancies.push({ purchase_id: p.id, missing: "sale", status: p.status });
      if (p.status === "refunded" && !types.has("refund") && !types.has("chargeback")) {
        discrepancies.push({ purchase_id: p.id, missing: "refund", status: p.status });
      }
    }

    const severity = await evaluateSeverity(sc, "ledger.discrepancies", discrepancies.length);

    await logFinancialEvent(sc, {
      event_type: discrepancies.length > 0 ? "ledger_discrepancy" : "ledger_reconcile_ok",
      severity, actor: "admin",
      correlation_id: corr, user_id: auth.userId,
      payload: {
        lookback_hours: hours, scanned: paid?.length ?? 0,
        discrepancies_count: discrepancies.length,
        first_10: discrepancies.slice(0, 10),
      },
    });

    // Auto-heal: call record_purchase_ledger for missing 'sale' rows
    let healed = 0;
    for (const d of discrepancies) {
      if (d.missing !== "sale") continue;
      const { error } = await sc.rpc("record_purchase_ledger", { _purchase_id: d.purchase_id });
      if (!error) healed += 1;
    }

    return json({
      ok: true, correlation_id: corr,
      scanned: paid?.length ?? 0,
      discrepancies: discrepancies.length,
      healed,
      severity,
      sample: discrepancies.slice(0, 20),
    });
  } catch (e) { return serverError(e); }
});
