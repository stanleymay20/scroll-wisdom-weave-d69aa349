/**
 * CreatorEarnings — creator revenue dashboard.
 * KPIs, funnel, top books, source attribution, recent ledger rows.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { trackStorefrontEvent } from "@/lib/storefrontAnalytics";
import { Wallet, TrendingUp, Receipt, AlertCircle } from "lucide-react";

const fmt = (cents: number, currency = "usd") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format((cents ?? 0) / 100);

interface Summary {
  totals: {
    currency: string;
    gross_cents: number;
    platform_fee_cents: number;
    net_cents: number;
    refund_cents: number;
    sales_count: number;
    refund_count: number;
    available_payout_cents: number;
    pending_payout_cents: number;
  };
  funnel: { listing_view: number; cta_click: number; checkout_started: number; checkout_completed: number };
  conversion_rate: number;
  refund_rate: number;
  arpu_cents: number;
  sources: Record<string, number>;
  revenue_by_source?: {
    source: string; medium: string | null; campaign: string | null;
    conversions: number; gross_cents: number; net_cents: number; refund_cents: number;
  }[];
  daily: { day: string; net_cents: number; gross_cents: number; sales_count: number }[];
  top_books: { book_id: string; title: string | null; sales: number; gross: number; net: number; refunds: number; visitors?: number; rpv_cents?: number | null }[];
  export_attribution?: { exports_count: number; assisted_sales_count?: number; assisted_gross_cents?: number; assisted_rpe_cents?: number | null; attribution_kind?: string; attribution_notes?: string };
  recent: {
    entry_type: string;
    gross_cents: number;
    creator_net_cents: number;
    currency: string;
    occurred_at: string;
    book_title_snapshot: string | null;
    listing_slug_snapshot: string | null;
    payout_status: string;
  }[];
}

export default function CreatorEarnings() {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "Creator earnings — ScrollLibrary";
    void trackStorefrontEvent(null, "earnings_view");
    (async () => {
      const { data: res, error } = await supabase.functions.invoke("creator-earnings-summary");
      if (!error) setData(res as Summary);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return <div className="container mx-auto py-8 px-4 max-w-6xl space-y-3">
      <Skeleton className="h-10 w-64" /><Skeleton className="h-32" /><Skeleton className="h-64" />
    </div>;
  }

  if (!data) {
    return <div className="container mx-auto py-12 px-4 max-w-2xl text-center">
      <h1 className="text-2xl font-bold">No earnings yet</h1>
      <p className="text-muted-foreground mt-2">Publish a book and your sales will appear here.</p>
      <Button asChild className="mt-6"><Link to="/library">Go to library</Link></Button>
    </div>;
  }

  const t = data.totals;
  const c = t.currency;
  const funnelSteps = [
    { label: "Views", value: data.funnel.listing_view },
    { label: "CTA clicks", value: data.funnel.cta_click },
    { label: "Checkout started", value: data.funnel.checkout_started },
    { label: "Purchases", value: data.funnel.checkout_completed },
  ];
  const maxFunnel = Math.max(1, ...funnelSteps.map((s) => s.value));

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Creator earnings</h1>
          <p className="text-sm text-muted-foreground mt-1">Revenue across all your published books.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild><Link to="/sell/analytics">Marketplace analytics</Link></Button>
          <Button asChild variant="outline"><Link to="/account/intelligence">Publishing intelligence</Link></Button>
          <Button asChild variant="outline"><Link to="/account/payouts">Payout settings</Link></Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4 flex items-center gap-3"><Wallet className="h-5 w-5 text-primary" /><div><div className="text-xs text-muted-foreground">Net earnings</div><div className="text-2xl font-semibold">{fmt(t.net_cents, c)}</div></div></CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3"><TrendingUp className="h-5 w-5 text-primary" /><div><div className="text-xs text-muted-foreground">Gross GMV</div><div className="text-2xl font-semibold">{fmt(t.gross_cents, c)}</div></div></CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3"><Receipt className="h-5 w-5 text-primary" /><div><div className="text-xs text-muted-foreground">Refunds</div><div className="text-2xl font-semibold">{fmt(t.refund_cents, c)}</div></div></CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3"><AlertCircle className="h-5 w-5 text-primary" /><div><div className="text-xs text-muted-foreground">Available to payout</div><div className="text-2xl font-semibold">{fmt(t.available_payout_cents, c)}</div></div></CardContent></Card>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div className="rounded-md bg-muted/40 p-3"><div className="text-xs text-muted-foreground">Sales</div><div className="text-xl font-semibold">{t.sales_count}</div></div>
        <div className="rounded-md bg-muted/40 p-3"><div className="text-xs text-muted-foreground">Refund rate</div><div className="text-xl font-semibold">{(data.refund_rate * 100).toFixed(1)}%</div></div>
        <div className="rounded-md bg-muted/40 p-3"><div className="text-xs text-muted-foreground">Conversion</div><div className="text-xl font-semibold">{(data.conversion_rate * 100).toFixed(2)}%</div></div>
        <div className="rounded-md bg-muted/40 p-3"><div className="text-xs text-muted-foreground">ARPU</div><div className="text-xl font-semibold">{fmt(data.arpu_cents, c)}</div></div>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Conversion funnel (last 90 days)</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {funnelSteps.map((s) => (
            <div key={s.label}>
              <div className="flex justify-between text-xs"><span>{s.label}</span><span>{s.value}</span></div>
              <div className="h-2 rounded-full bg-muted overflow-hidden mt-1">
                <div className="h-full bg-primary transition-all" style={{ width: `${(s.value / maxFunnel) * 100}%` }} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Top books</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.top_books.length === 0 && <div className="text-sm text-muted-foreground">No sales yet.</div>}
            {data.top_books.map((b) => (
              <div key={b.book_id} className="flex items-center justify-between text-sm">
                <div className="min-w-0 truncate">{b.title || b.book_id.slice(0, 8) + "…"}</div>
                <div className="text-right shrink-0">
                  <div className="font-semibold">{fmt(b.net, c)}</div>
                  <div className="text-xs text-muted-foreground">
                    {b.sales} sales · {b.refunds} refunds
                    {b.visitors ? ` · ${b.visitors} visitors` : ""}
                    {b.rpv_cents != null ? ` · RPV ${fmt(b.rpv_cents, c)}` : ""}
                  </div>
                </div>
              </div>
            ))}
            {data.export_attribution && data.export_attribution.exports_count > 0 && (
              <div className="mt-3 pt-3 border-t border-border/40 text-xs text-muted-foreground">
                Exports last 90d: <span className="font-semibold text-foreground">{data.export_attribution.exports_count}</span>
                {data.export_attribution.assisted_rpe_cents != null && <> · Assisted RPE <span className="font-semibold text-foreground">{fmt(data.export_attribution.assisted_rpe_cents, c)}</span></>}
                {data.export_attribution.assisted_sales_count != null && <> · {data.export_attribution.assisted_sales_count} sales after first export</>}
                <div className="mt-1 italic">Assisted attribution — not a causal link.</div>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Revenue by source</CardTitle>
            <div className="text-xs text-muted-foreground">First-touch attribution · source / medium / campaign</div>
          </CardHeader>
          <CardContent className="space-y-2">
            {(!data.revenue_by_source || data.revenue_by_source.length === 0) && (
              <div className="text-sm text-muted-foreground">No attributed sales yet.</div>
            )}
            {(data.revenue_by_source ?? []).map((s, i) => {
              const net = s.gross_cents - s.refund_cents;
              return (
                <div key={i} className="flex justify-between text-sm gap-2 border-b border-border/40 py-1">
                  <div className="min-w-0 truncate">
                    <div className="font-mono text-xs truncate">
                      {s.source}{s.medium ? ` · ${s.medium}` : ""}{s.campaign ? ` · ${s.campaign}` : ""}
                    </div>
                    <div className="text-xs text-muted-foreground">{s.conversions} sales</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-semibold">{fmt(net, c)}</div>
                    {s.refund_cents > 0 && <div className="text-xs text-destructive">−{fmt(s.refund_cents, c)} refunds</div>}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Recent activity</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          {data.recent.length === 0 && <div className="text-sm text-muted-foreground">No transactions yet.</div>}
          {data.recent.map((r, i) => (
            <div key={i} className="flex items-center justify-between text-sm border-b border-border/40 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={r.entry_type === "sale" ? "default" : "destructive"} className="text-xs">{r.entry_type}</Badge>
                  <span className="truncate">{r.book_title_snapshot || r.listing_slug_snapshot || "—"}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {new Date(r.occurred_at).toLocaleString()} · payout: {r.payout_status}
                </div>
              </div>
              <div className={`font-semibold shrink-0 ${r.creator_net_cents < 0 ? "text-destructive" : ""}`}>
                {fmt(r.creator_net_cents, r.currency)}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
