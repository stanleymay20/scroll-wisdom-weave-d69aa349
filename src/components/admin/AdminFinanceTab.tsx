/**
 * AdminFinanceTab — server-aggregated platform finance overview.
 * Reads via admin-finance-summary edge function (admin-only enforced server-side).
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { trackStorefrontEvent } from "@/lib/storefrontAnalytics";

const fmt = (cents: number, currency = "usd") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format((cents ?? 0) / 100);

interface FinanceData {
  totals: {
    currency: string;
    platform_revenue_cents: number;
    creator_revenue_cents: number;
    gross_cents: number;
    refund_cents: number;
    sales_count: number;
    refund_count: number;
    refund_rate: number;
  };
  failed_payments: number;
  top_creators: { creator_user_id: string; name: string | null; gross: number; platform_fee: number; sales: number }[];
  top_books: { book_id: string; title: string | null; gross: number; sales: number }[];
  series: { day: string; gross: number; platform_fee: number; net: number; refund: number; sales: number; refunds: number }[];
  fee: { value: { bps: number }; updated_at: string } | null;
  refunds_queue: { id: string; purchase_id: string; status: string; reason: string | null; amount_cents: number; currency: string; created_at: string; processed_at: string | null; error_message: string | null }[];
  chargebacks_pending: { id: string; stripe_dispute_id: string; amount_cents: number; reason: string | null; status: string; evidence_due_by: string | null; created_at: string }[];
  cohorts: { metric_date: string; paying_users: number; gross_cents: number; visitors: number; exports_count: number; rpv_cents: number | null; rpe_cents: number | null }[];
  top_sources: { source: string; visitors: number }[];
  revenue_by_source: {
    source: string; medium: string | null; campaign: string | null;
    visitors: number; conversions: number;
    gross_cents: number; net_cents: number; refund_cents: number;
    conversion_rate: number; refund_rate: number;
  }[];
  funnel: { stage: string; count: number }[];
  reconciliation_recent: { created_at: string; severity: string; scanned: number; discrepancies_count: number; healed: number }[];
}

export function AdminFinanceTab() {
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [feeDraft, setFeeDraft] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: res, error } = await supabase.functions.invoke("admin-finance-summary");
    if (error) toast.error("Failed to load finance data");
    else {
      setData(res as FinanceData);
      setFeeDraft(String((res as FinanceData)?.fee?.value?.bps ?? 1500));
    }
    setLoading(false);
  };

  useEffect(() => {
    void trackStorefrontEvent(null, "admin_finance_view");
    void load();
  }, []);

  const updateFee = async () => {
    const bps = parseInt(feeDraft, 10);
    if (Number.isNaN(bps) || bps < 0 || bps > 10000) {
      toast.error("Fee must be 0–10000 bps");
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("set_platform_fee", { _bps: bps });
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success(`Platform fee updated to ${(bps / 100).toFixed(2)}%`);
      void trackStorefrontEvent(null, "platform_fee_updated", { bps });
      void load();
    }
  };

  if (loading) return <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>;
  if (!data) return <div className="text-sm text-muted-foreground">No data.</div>;

  const c = data.totals.currency;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Platform revenue</div><div className="text-2xl font-semibold">{fmt(data.totals.platform_revenue_cents, c)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Creator revenue</div><div className="text-2xl font-semibold">{fmt(data.totals.creator_revenue_cents, c)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Gross GMV</div><div className="text-2xl font-semibold">{fmt(data.totals.gross_cents, c)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Refunds</div><div className="text-2xl font-semibold">{fmt(data.totals.refund_cents, c)}</div></CardContent></Card>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div className="rounded-md bg-muted/40 p-3"><div className="text-xs text-muted-foreground">Sales</div><div className="text-xl font-semibold">{data.totals.sales_count}</div></div>
        <div className="rounded-md bg-muted/40 p-3"><div className="text-xs text-muted-foreground">Refunds</div><div className="text-xl font-semibold">{data.totals.refund_count}</div></div>
        <div className="rounded-md bg-muted/40 p-3"><div className="text-xs text-muted-foreground">Refund rate</div><div className="text-xl font-semibold">{(data.totals.refund_rate * 100).toFixed(1)}%</div></div>
        <div className="rounded-md bg-muted/40 p-3"><div className="text-xs text-muted-foreground">Failed payments</div><div className="text-xl font-semibold">{data.failed_payments}</div></div>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Platform fee</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Basis points (100 = 1%)</label>
              <Input type="number" min={0} max={10000} value={feeDraft} onChange={(e) => setFeeDraft(e.target.value)} className="w-32 text-foreground caret-foreground" />
            </div>
            <div className="text-sm">= <span className="font-semibold">{(parseInt(feeDraft || "0", 10) / 100).toFixed(2)}%</span></div>
            <Button onClick={updateFee} disabled={saving}>Save</Button>
          </div>
          {data.fee && (
            <p className="text-xs text-muted-foreground mt-2">
              Currently {((data.fee.value.bps) / 100).toFixed(2)}% — updated {new Date(data.fee.updated_at).toLocaleString()}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Top creators</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.top_creators.length === 0 && <div className="text-sm text-muted-foreground">No sales yet.</div>}
            {data.top_creators.map((c) => (
              <div key={c.creator_user_id} className="flex items-center justify-between text-sm">
                <div className="min-w-0 truncate">{c.name || c.creator_user_id.slice(0, 8) + "…"}</div>
                <div className="text-right shrink-0">
                  <div className="font-semibold">{fmt(c.gross)}</div>
                  <div className="text-xs text-muted-foreground">{c.sales} sales · fee {fmt(c.platform_fee)}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Top books</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.top_books.length === 0 && <div className="text-sm text-muted-foreground">No sales yet.</div>}
            {data.top_books.map((b) => (
              <div key={b.book_id} className="flex items-center justify-between text-sm">
                <div className="min-w-0 truncate">{b.title || b.book_id.slice(0, 8) + "…"}</div>
                <div className="text-right shrink-0">
                  <div className="font-semibold">{fmt(b.gross)}</div>
                  <div className="text-xs text-muted-foreground">{b.sales} sales</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Last 30 days</CardTitle></CardHeader>
        <CardContent>
          {data.series.length === 0 ? (
            <div className="text-sm text-muted-foreground">No activity in the last 30 days.</div>
          ) : (
            <div className="space-y-1 text-xs font-mono">
              {data.series.map((d) => (
                <div key={d.day} className="flex justify-between border-b border-border/40 py-1">
                  <span>{d.day}</span>
                  <span>{d.sales} sales / {d.refunds} refunds · GMV {fmt(d.gross)} · platform {fmt(d.platform_fee)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Refunds queue</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(data.refunds_queue ?? []).length === 0 && <div className="text-muted-foreground">No refund requests.</div>}
            {(data.refunds_queue ?? []).slice(0, 10).map((r) => (
              <div key={r.id} className="flex justify-between border-b border-border/40 py-1">
                <div className="min-w-0 truncate">
                  <div className="font-mono text-xs truncate">{r.purchase_id.slice(0, 8)}… · {r.reason ?? "n/a"}</div>
                  {r.error_message && <div className="text-xs text-destructive truncate">{r.error_message}</div>}
                </div>
                <div className="text-right shrink-0">
                  <div className="font-semibold">{fmt(r.amount_cents, r.currency)}</div>
                  <div className="text-xs text-muted-foreground">{r.status}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Chargebacks pending</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(data.chargebacks_pending ?? []).length === 0 && <div className="text-muted-foreground">No active disputes.</div>}
            {(data.chargebacks_pending ?? []).slice(0, 10).map((cb) => (
              <div key={cb.id} className="flex justify-between border-b border-border/40 py-1">
                <div className="min-w-0 truncate">
                  <div className="font-mono text-xs truncate">{cb.stripe_dispute_id}</div>
                  <div className="text-xs text-muted-foreground">{cb.reason ?? "—"} · due {cb.evidence_due_by ? new Date(cb.evidence_due_by).toLocaleDateString() : "n/a"}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-semibold">{fmt(cb.amount_cents)}</div>
                  <div className="text-xs text-muted-foreground">{cb.status}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Daily activity (last 30d)</CardTitle></CardHeader>
          <CardContent>
            {(data.cohorts ?? []).length === 0 ? (
              <div className="text-sm text-muted-foreground">No daily rollup yet. Run analytics-cohort-rollup.</div>
            ) : (
              <>
                <div className="text-xs text-muted-foreground mb-2">Daily snapshots — not true cohort retention.</div>
                <div className="space-y-1 text-xs font-mono max-h-56 overflow-y-auto">
                  {data.cohorts.map((co) => (
                    <div key={co.metric_date} className="flex justify-between border-b border-border/40 py-1">
                      <span>{co.metric_date}</span>
                      <span>{co.paying_users} paying · {co.visitors} visitors · RPV {co.rpv_cents != null ? fmt(Number(co.rpv_cents)) : "—"} · RPE {co.rpe_cents != null ? fmt(Number(co.rpe_cents)) : "—"}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Revenue by source (30d)</CardTitle>
            <div className="text-xs text-muted-foreground">First-touch attribution · source / medium / campaign</div>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {(data.revenue_by_source ?? []).length === 0 && <div className="text-muted-foreground">No attribution data yet.</div>}
            {(data.revenue_by_source ?? []).map((s, i) => {
              const net = s.gross_cents - s.refund_cents;
              return (
                <div key={i} className="flex justify-between border-b border-border/40 py-1 gap-2">
                  <div className="min-w-0 truncate">
                    <div className="font-mono text-xs truncate">
                      {s.source}{s.medium ? ` · ${s.medium}` : ""}{s.campaign ? ` · ${s.campaign}` : ""}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {s.visitors} visitors · {s.conversions} sales · CR {(s.conversion_rate * 100).toFixed(1)}%
                    </div>
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

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Funnel dropoff (30d)</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {(data.funnel ?? []).map((f, i) => {
              const prev = i > 0 ? data.funnel[i - 1].count : f.count;
              const rate = prev > 0 ? (f.count / prev) * 100 : 100;
              return (
                <div key={f.stage} className="flex justify-between border-b border-border/40 py-1">
                  <span className="font-mono text-xs">{f.stage}</span>
                  <span className="text-xs">{f.count.toLocaleString()} <span className="text-muted-foreground">({rate.toFixed(1)}%)</span></span>
                </div>
              );
            })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Reconciliation discrepancies (7d)</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {(data.reconciliation_recent ?? []).length === 0 ? (
              <div className="text-muted-foreground">No discrepancies detected.</div>
            ) : (
              data.reconciliation_recent.map((r, i) => (
                <div key={i} className="text-xs border-b border-border/40 py-1">
                  <div className="text-muted-foreground">{new Date(r.created_at).toLocaleString()}</div>
                  <div className="font-mono">scanned {r.scanned} · discrepancies {r.discrepancies_count} · healed {r.healed} · {r.severity}</div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
