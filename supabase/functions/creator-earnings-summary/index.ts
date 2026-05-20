// Creator earnings summary — aggregates ledger + funnel events for the caller.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { preflight, json, serverError, requireUser, serviceClient } from "../_shared/http.ts";

serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  try {
    const sc = serviceClient();
    const userId = auth.userId;
    const since30 = new Date(Date.now() - 30 * 86400_000).toISOString();
    const since90 = new Date(Date.now() - 90 * 86400_000).toISOString();

    // Ledger rows
    const { data: ledger, error: ledgerErr } = await sc
      .from("creator_earnings_ledger")
      .select("entry_type,gross_cents,platform_fee_cents,creator_net_cents,currency,payout_status,occurred_at,book_id,book_title_snapshot,listing_id,listing_slug_snapshot")
      .eq("creator_user_id", userId)
      .order("occurred_at", { ascending: false })
      .limit(2000);
    if (ledgerErr) return serverError(ledgerErr, "ledger_query_failed");

    const sum = (rows: any[], key: string) => rows.reduce((a, r) => a + (r[key] ?? 0), 0);
    const sales = (ledger ?? []).filter((r) => r.entry_type === "sale");
    const refunds = (ledger ?? []).filter((r) => r.entry_type === "refund" || r.entry_type === "chargeback");

    const totals = {
      currency: sales[0]?.currency ?? "usd",
      gross_cents: sum(sales, "gross_cents"),
      platform_fee_cents: sum(sales, "platform_fee_cents"),
      net_cents: sum(sales, "creator_net_cents") + sum(refunds, "creator_net_cents"),
      refund_cents: -sum(refunds, "gross_cents"),
      sales_count: sales.length,
      refund_count: refunds.length,
      available_payout_cents: (ledger ?? [])
        .filter((r) => r.payout_status === "available")
        .reduce((a, r) => a + (r.creator_net_cents ?? 0), 0),
      pending_payout_cents: (ledger ?? [])
        .filter((r) => r.payout_status === "pending" && r.entry_type === "sale")
        .reduce((a, r) => a + (r.creator_net_cents ?? 0), 0),
    };

    // Daily series (last 30 days)
    const { data: daily } = await sc
      .from("creator_revenue_daily")
      .select("day,book_id,gross_cents,refund_cents,net_cents,sales_count,refund_count")
      .eq("creator_user_id", userId)
      .gte("day", since30.slice(0, 10))
      .order("day", { ascending: true });

    // Top books
    const bookMap = new Map<string, any>();
    for (const r of sales) {
      const k = r.book_id;
      const cur = bookMap.get(k) ?? { book_id: k, title: r.book_title_snapshot, sales: 0, gross: 0, net: 0, refunds: 0 };
      cur.sales += 1; cur.gross += r.gross_cents; cur.net += r.creator_net_cents; bookMap.set(k, cur);
    }
    for (const r of refunds) {
      const cur = bookMap.get(r.book_id); if (cur) { cur.refunds += 1; cur.net += r.creator_net_cents; }
    }
    const top_books = [...bookMap.values()].sort((a, b) => b.gross - a.gross).slice(0, 10);

    // Funnel from storefront_events for this creator's listings
    const { data: listings } = await sc
      .from("public_listings")
      .select("id, books!inner(user_id)")
      .eq("books.user_id", userId);
    const listingIds = (listings ?? []).map((l: any) => l.id);

    let funnel = { listing_view: 0, cta_click: 0, checkout_started: 0, checkout_completed: 0 };
    let sources: Record<string, number> = {}; // legacy compat — visitor counts by source
    if (listingIds.length) {
      const { data: events } = await sc
        .from("storefront_events")
        .select("event_type, metadata, created_at")
        .in("listing_id", listingIds)
        .gte("created_at", since90);
      for (const e of events ?? []) {
        if (e.event_type in funnel) (funnel as any)[e.event_type] += 1;
      }
    }

    // Phase 2.1d.2 — Revenue-by-source from attribution_sessions, scoped to
    // this creator's purchases only. Replaces the old event-metadata source
    // counter which never carried real first-touch values.
    const creatorPurchaseIds = new Set<string>(
      (ledger ?? []).map((r: any) => r.purchase_id).filter(Boolean)
    );
    const revenue_by_source: Array<{
      source: string; medium: string | null; campaign: string | null;
      conversions: number; gross_cents: number; net_cents: number; refund_cents: number;
    }> = [];
    if (creatorPurchaseIds.size) {
      const { data: attrRows } = await sc.from("attribution_sessions")
        .select("first_touch_source,first_touch_medium,first_touch_campaign,converted_purchase_id")
        .in("converted_purchase_id", [...creatorPurchaseIds]);
      const purchaseToKey = new Map<string, string>();
      const bySource = new Map<string, any>();
      const keyOf = (s: any) =>
        `${s.first_touch_source ?? "direct"}\u241f${s.first_touch_medium ?? ""}\u241f${s.first_touch_campaign ?? ""}`;
      for (const s of attrRows ?? []) {
        if (!s.converted_purchase_id) continue;
        const k = keyOf(s);
        purchaseToKey.set(s.converted_purchase_id, k);
        const row = bySource.get(k) ?? {
          source: s.first_touch_source ?? "direct",
          medium: s.first_touch_medium ?? null,
          campaign: s.first_touch_campaign ?? null,
          conversions: 0, gross_cents: 0, net_cents: 0, refund_cents: 0,
        };
        row.conversions += 1;
        bySource.set(k, row);
      }
      for (const r of ledger ?? []) {
        const k = purchaseToKey.get((r as any).purchase_id);
        if (!k) continue;
        const row = bySource.get(k);
        if (!row) continue;
        if (r.entry_type === "sale") {
          row.gross_cents += r.gross_cents ?? 0;
          row.net_cents += r.creator_net_cents ?? 0;
        } else if (r.entry_type === "refund" || r.entry_type === "chargeback") {
          row.refund_cents += -(r.gross_cents ?? 0);
          row.net_cents += r.creator_net_cents ?? 0;
        }
      }
      for (const row of bySource.values()) {
        revenue_by_source.push(row);
        sources[row.source] = (sources[row.source] ?? 0) + row.conversions;
      }
      revenue_by_source.sort((a, b) => (b.gross_cents - b.refund_cents) - (a.gross_cents - a.refund_cents));
    }

    const conversion_rate = funnel.listing_view > 0
      ? funnel.checkout_completed / funnel.listing_view : 0;
    const arpu_cents = funnel.checkout_completed > 0
      ? Math.round(totals.gross_cents / funnel.checkout_completed) : 0;
    const refund_rate = totals.sales_count > 0
      ? totals.refund_count / totals.sales_count : 0;

    // Phase 2.1d.1 — per-book revenue per visitor (RPV).
    // Count DISTINCT session_id per listing (not raw view rows) so reloads
    // and quick re-mounts don't inflate the denominator.
    const visitorsByBook = new Map<string, number>();
    if (listingIds.length) {
      const { data: views } = await sc.from("storefront_events")
        .select("listing_id, session_id")
        .eq("event_type", "listing_view")
        .in("listing_id", listingIds)
        .not("session_id", "is", null)
        .gte("created_at", since90);
      const { data: listingBookMap } = await sc.from("public_listings")
        .select("id, book_id").in("id", listingIds);
      const listingToBook = new Map((listingBookMap ?? []).map((l: any) => [l.id, l.book_id]));
      const sessionsByBook = new Map<string, Set<string>>();
      for (const v of views ?? []) {
        const bid = listingToBook.get(v.listing_id as any);
        const sid = (v as any).session_id as string | null;
        if (!bid || !sid) continue;
        if (!sessionsByBook.has(bid)) sessionsByBook.set(bid, new Set());
        sessionsByBook.get(bid)!.add(sid);
      }
      for (const [bid, set] of sessionsByBook.entries()) visitorsByBook.set(bid, set.size);
    }
    const top_books_with_rpv = top_books.map((b: any) => ({
      ...b,
      visitors: visitorsByBook.get(b.book_id) ?? 0,
      rpv_cents: (visitorsByBook.get(b.book_id) ?? 0) > 0
        ? Math.round(b.gross / (visitorsByBook.get(b.book_id) ?? 1)) : null,
    }));

    // Phase 2.1d.1 — export-to-sale attribution.
    // We don't yet have an exact "sale caused by this export" link, so we
    // surface this as ASSISTED attribution: sales that happened in the same
    // 90d window after at least one export event by the creator. We label it
    // clearly so the UI cannot mistake it for true RPE.
    const { data: bundleEvents } = await sc.from("storefront_events")
      .select("event_type, metadata, created_at")
      .eq("user_id", userId)
      .in("event_type", ["kdp_export_completed", "gumroad_export_completed"])
      .gte("created_at", since90);
    const exports_count = bundleEvents?.length ?? 0;
    const firstExportAt = (bundleEvents ?? [])
      .map(e => e.created_at).sort()[0] ?? null;
    const assistedSales = firstExportAt
      ? sales.filter(s => s.occurred_at > firstExportAt)
      : [];
    const assistedGross = assistedSales.reduce((a, r) => a + (r.gross_cents ?? 0), 0);
    const export_attribution = {
      exports_count,
      assisted_sales_count: assistedSales.length,
      assisted_gross_cents: assistedGross,
      assisted_rpe_cents: exports_count > 0
        ? Math.round(assistedGross / exports_count) : null,
      attribution_kind: "assisted" as const,
      attribution_notes:
        "Counts sales that occurred after the first export in the last 90d. " +
        "Not a causal link — true RPE requires source-tagged export funnels.",
    };

    return json({
      totals,
      funnel,
      conversion_rate,
      refund_rate,
      arpu_cents,
      sources,
      daily: daily ?? [],
      top_books: top_books_with_rpv,
      export_attribution,
      recent: (ledger ?? []).slice(0, 25),
      generated_at: new Date().toISOString(),
    });
  } catch (e) { return serverError(e); }
});
