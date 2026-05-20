// Admin finance summary — platform revenue / top creators / refund rate.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { preflight, json, forbidden, serverError, requireUser, serviceClient } from "../_shared/http.ts";

serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  try {
    const sc = serviceClient();
    const { data: role } = await sc.from("user_roles")
      .select("role").eq("user_id", auth.userId).eq("role", "admin").maybeSingle();
    if (!role) return forbidden("admin_only");

    const since30 = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);

    const { data: ledger } = await sc
      .from("creator_earnings_ledger")
      .select("entry_type,gross_cents,platform_fee_cents,creator_net_cents,currency,creator_user_id,book_id,book_title_snapshot,creator_display_name_snapshot,occurred_at")
      .order("occurred_at", { ascending: false })
      .limit(5000);

    const sales = (ledger ?? []).filter((r) => r.entry_type === "sale");
    const refunds = (ledger ?? []).filter((r) => r.entry_type === "refund" || r.entry_type === "chargeback");

    const totals = {
      currency: sales[0]?.currency ?? "usd",
      platform_revenue_cents: sales.reduce((a, r) => a + (r.platform_fee_cents ?? 0), 0)
        + refunds.reduce((a, r) => a + (r.platform_fee_cents ?? 0), 0),
      creator_revenue_cents: sales.reduce((a, r) => a + (r.creator_net_cents ?? 0), 0)
        + refunds.reduce((a, r) => a + (r.creator_net_cents ?? 0), 0),
      gross_cents: sales.reduce((a, r) => a + (r.gross_cents ?? 0), 0),
      refund_cents: -refunds.reduce((a, r) => a + (r.gross_cents ?? 0), 0),
      sales_count: sales.length,
      refund_count: refunds.length,
      refund_rate: sales.length ? refunds.length / sales.length : 0,
    };

    // Failed payments
    const { count: failed_payments } = await sc
      .from("book_purchases")
      .select("*", { count: "exact", head: true })
      .eq("status", "failed");

    // Top creators
    const creatorMap = new Map<string, any>();
    for (const r of sales) {
      const k = r.creator_user_id;
      const cur = creatorMap.get(k) ?? { creator_user_id: k, name: r.creator_display_name_snapshot, gross: 0, platform_fee: 0, sales: 0 };
      cur.gross += r.gross_cents; cur.platform_fee += r.platform_fee_cents; cur.sales += 1;
      creatorMap.set(k, cur);
    }
    const top_creators = [...creatorMap.values()].sort((a, b) => b.gross - a.gross).slice(0, 10);

    // Top books
    const bookMap = new Map<string, any>();
    for (const r of sales) {
      const k = r.book_id;
      const cur = bookMap.get(k) ?? { book_id: k, title: r.book_title_snapshot, gross: 0, sales: 0 };
      cur.gross += r.gross_cents; cur.sales += 1; bookMap.set(k, cur);
    }
    const top_books = [...bookMap.values()].sort((a, b) => b.gross - a.gross).slice(0, 10);

    // By day
    const { data: daily } = await sc
      .from("creator_revenue_daily")
      .select("day,gross_cents,platform_fee_cents,net_cents,refund_cents,sales_count,refund_count")
      .gte("day", since30)
      .order("day", { ascending: true });
    const byDay = new Map<string, any>();
    for (const r of daily ?? []) {
      const d = r.day;
      const cur = byDay.get(d) ?? { day: d, gross: 0, platform_fee: 0, net: 0, refund: 0, sales: 0, refunds: 0 };
      cur.gross += r.gross_cents; cur.platform_fee += r.platform_fee_cents; cur.net += r.net_cents;
      cur.refund += r.refund_cents; cur.sales += r.sales_count; cur.refunds += r.refund_count;
      byDay.set(d, cur);
    }
    const series = [...byDay.values()];

    // Current fee
    const { data: feeRow } = await sc
      .from("platform_config").select("value,updated_at,updated_by")
      .eq("key", "revenue.platform_fee_bps").maybeSingle();

    // Phase 2.1d additions
    const { data: refundsQueue } = await sc.from("refund_requests")
      .select("id,purchase_id,book_id,buyer_user_id,creator_user_id,status,reason,amount_cents,currency,stripe_refund_id,error_message,created_at,processed_at")
      .order("created_at", { ascending: false }).limit(50);

    const { data: chargebacksPending } = await sc.from("chargebacks")
      .select("id,stripe_dispute_id,amount_cents,currency,reason,status,evidence_due_by,created_at")
      .in("status", ["needs_response", "warning_needs_response", "warning_under_review", "under_review"])
      .order("created_at", { ascending: false }).limit(50);

    const { data: cohorts } = await sc.from("cohort_metrics")
      .select("metric_date,paying_users,active_users,gross_cents,refund_cents,net_cents,visitors,exports_count,rpv_cents,rpe_cents")
      .gte("metric_date", since30)
      .order("metric_date", { ascending: true });

    // Phase 2.1d.2 — Revenue-by-source (first-touch attribution).
    // 1) Visitors per source/medium/campaign from all sessions in window.
    // 2) Conversions + revenue by joining converted_purchase_id → ledger.
    const { data: allSessions } = await sc.from("attribution_sessions")
      .select("first_touch_source,first_touch_medium,first_touch_campaign,converted_purchase_id")
      .gte("first_seen_at", since30 + "T00:00:00Z");

    const sourceKey = (s: any) =>
      `${s.first_touch_source ?? "direct"}\u241f${s.first_touch_medium ?? ""}\u241f${s.first_touch_campaign ?? ""}`;

    const bySource = new Map<string, {
      source: string; medium: string | null; campaign: string | null;
      visitors: number; conversions: number;
      gross_cents: number; net_cents: number; refund_cents: number;
    }>();
    const convertedPurchaseIds: string[] = [];
    const purchaseToKey = new Map<string, string>();

    for (const s of allSessions ?? []) {
      const k = sourceKey(s);
      const row = bySource.get(k) ?? {
        source: s.first_touch_source ?? "direct",
        medium: s.first_touch_medium ?? null,
        campaign: s.first_touch_campaign ?? null,
        visitors: 0, conversions: 0, gross_cents: 0, net_cents: 0, refund_cents: 0,
      };
      row.visitors += 1;
      if (s.converted_purchase_id) {
        row.conversions += 1;
        convertedPurchaseIds.push(s.converted_purchase_id);
        purchaseToKey.set(s.converted_purchase_id, k);
      }
      bySource.set(k, row);
    }

    if (convertedPurchaseIds.length) {
      const { data: ledgerRows } = await sc.from("creator_earnings_ledger")
        .select("purchase_id,entry_type,gross_cents,creator_net_cents")
        .in("purchase_id", convertedPurchaseIds);
      for (const lr of ledgerRows ?? []) {
        const k = purchaseToKey.get(lr.purchase_id);
        if (!k) continue;
        const row = bySource.get(k);
        if (!row) continue;
        if (lr.entry_type === "sale") {
          row.gross_cents += lr.gross_cents ?? 0;
          row.net_cents += lr.creator_net_cents ?? 0;
        } else if (lr.entry_type === "refund" || lr.entry_type === "chargeback") {
          row.refund_cents += -(lr.gross_cents ?? 0); // gross_cents are negative on refunds
          row.net_cents += lr.creator_net_cents ?? 0;
        }
      }
    }

    const revenue_by_source = [...bySource.values()]
      .map((r) => ({
        ...r,
        conversion_rate: r.visitors > 0 ? r.conversions / r.visitors : 0,
        refund_rate: r.conversions > 0 ? r.refund_cents / Math.max(r.gross_cents, 1) : 0,
      }))
      .sort((a, b) => (b.gross_cents - b.refund_cents) - (a.gross_cents - a.refund_cents))
      .slice(0, 20);

    // Backwards-compat: keep top_sources for any consumer not yet updated.
    const top_sources = revenue_by_source
      .map((r) => ({ source: r.source, visitors: r.visitors }))
      .sort((a, b) => b.visitors - a.visitors).slice(0, 10);

    // Funnel dropoff (last 30d storefront events)
    const { data: events } = await sc.from("storefront_events")
      .select("event_type")
      .gte("created_at", since30 + "T00:00:00Z")
      .in("event_type", ["listing_view", "checkout_started", "checkout_completed", "full_book_unlocked"])
      .limit(50000);
    const funnelCounts: Record<string, number> = {
      listing_view: 0, checkout_started: 0, checkout_completed: 0, full_book_unlocked: 0,
    };
    for (const e of events ?? []) funnelCounts[e.event_type] = (funnelCounts[e.event_type] ?? 0) + 1;
    const funnel = ["listing_view", "checkout_started", "checkout_completed", "full_book_unlocked"]
      .map((stage) => ({ stage, count: funnelCounts[stage] ?? 0 }));

    // Reconciliation discrepancies (last 7d).
    // Phase 2.1d.1 — expose only explicit safe scalars from payload to avoid
    // accidental PII / raw stripe object leakage through the admin tab.
    const since7 = new Date(Date.now() - 7 * 86400_000).toISOString();
    const { data: discrepEvents } = await sc.from("financial_events")
      .select("created_at,payload,severity")
      .eq("event_type", "ledger_discrepancy")
      .gte("created_at", since7)
      .order("created_at", { ascending: false }).limit(10);
    const reconciliation_recent = (discrepEvents ?? []).map((r) => {
      const p = (r.payload ?? {}) as Record<string, unknown>;
      return {
        created_at: r.created_at,
        severity: r.severity,
        scanned: typeof p.scanned === "number" ? p.scanned : 0,
        discrepancies_count: typeof p.discrepancies_count === "number" ? p.discrepancies_count : 0,
        healed: typeof p.healed === "number" ? p.healed : 0,
      };
    });

    return json({
      totals,
      failed_payments: failed_payments ?? 0,
      top_creators,
      top_books,
      series,
      fee: feeRow ?? null,
      refunds_queue: refundsQueue ?? [],
      chargebacks_pending: chargebacksPending ?? [],
      cohorts: cohorts ?? [],
      top_sources,
      revenue_by_source,
      funnel,
      reconciliation_recent,
      generated_at: new Date().toISOString(),
    });
  } catch (e) { return serverError(e); }
});
