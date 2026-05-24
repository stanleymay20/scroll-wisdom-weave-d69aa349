/**
 * AdminRecommendationsTab — rail CTR, diversity, weight tuning.
 *
 * Surfaces:
 *   - Rail performance by (source, context): shown / clicked / sampled /
 *     purchased / hidden + CTR / sample / purchase / hide rates.
 *   - Diversity: top authors & categories among impressions, concentration ratio.
 *   - Discovery weight editor (audited via admin_update_discovery_weight RPC).
 */
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Save, TrendingUp, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type RailRow = {
  source: string;
  context: string;
  shown: number; clicked: number; sampled: number; purchased: number; hidden: number;
  ctr: number; sample_rate: number; purchase_rate: number; hide_rate: number;
  unique_users: number; unique_listings: number;
};

type Diversity = {
  total_impressions: number;
  unique_authors: number;
  unique_categories: number;
  top5_author_share: number;
  authors: Array<{ author_user_id: string; display_name: string; impressions: number; share: number }>;
  categories: Array<{ category: string; impressions: number; share: number }>;
};

type WeightRow = { key: string; value: number; description: string | null };

const WINDOWS = [
  { label: "Last 24h", value: 1 },
  { label: "Last 7d",  value: 7 },
  { label: "Last 14d", value: 14 },
  { label: "Last 30d", value: 30 },
];

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

export function AdminRecommendationsTab() {
  const [windowDays, setWindowDays] = useState(14);
  const [loading, setLoading] = useState(true);
  const [rails, setRails] = useState<RailRow[]>([]);
  const [diversity, setDiversity] = useState<Diversity | null>(null);
  const [weights, setWeights] = useState<WeightRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: r, error: e1 }, { data: d, error: e2 }, { data: w, error: e3 }] = await Promise.all([
        supabase.rpc("get_recommendation_analytics", { _window_days: windowDays }),
        supabase.rpc("get_recommendation_diversity", { _window_days: windowDays }),
        supabase.from("discovery_weights").select("key, value, description").order("key"),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      if (e3) throw e3;
      setRails((r as RailRow[]) ?? []);
      setDiversity((d as unknown as Diversity) ?? null);
      const wr = (w as WeightRow[]) ?? [];
      setWeights(wr);
      setDrafts(Object.fromEntries(wr.map((row) => [row.key, String(row.value)])));
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, [windowDays]);

  useEffect(() => { load(); }, [load]);

  const saveWeight = async (key: string) => {
    const raw = drafts[key];
    const num = Number(raw);
    if (!Number.isFinite(num) || num < 0 || num > 1000) {
      toast.error("Value must be a number between 0 and 1000");
      return;
    }
    setSavingKey(key);
    try {
      const { error } = await supabase.rpc("admin_update_discovery_weight", { _key: key, _value: num });
      if (error) throw error;
      toast.success(`Updated ${key}`);
      await load();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to update weight");
    } finally {
      setSavingKey(null);
    }
  };

  // Aggregate totals across rails for headline stats.
  const totals = rails.reduce(
    (acc, r) => ({
      shown: acc.shown + r.shown,
      clicked: acc.clicked + r.clicked,
      sampled: acc.sampled + r.sampled,
      purchased: acc.purchased + r.purchased,
      hidden: acc.hidden + r.hidden,
    }),
    { shown: 0, clicked: 0, sampled: 0, purchased: 0, hidden: 0 },
  );
  const overallCtr = totals.shown ? totals.clicked / totals.shown : 0;
  const overallSample = totals.clicked ? totals.sampled / totals.clicked : 0;
  const overallPurchase = totals.clicked ? totals.purchased / totals.clicked : 0;
  const overallHide = totals.shown ? totals.hidden / totals.shown : 0;

  const concentration = diversity?.top5_author_share ?? 0;
  const concentrationWarn = concentration > 0.6;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Recommendation analytics</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Rail CTR, diversity, and discovery scoring weights.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(windowDays)} onValueChange={(v) => setWindowDays(Number(v))}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {WINDOWS.map((w) => (
                <SelectItem key={w.value} value={String(w.value)}>{w.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Headline */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20" />)
        ) : (
          <>
            <Stat label="Impressions" value={totals.shown.toLocaleString()} />
            <Stat label="CTR" value={pct(overallCtr)} hint={`${totals.clicked.toLocaleString()} clicks`} />
            <Stat label="Sample rate" value={pct(overallSample)} hint={`${totals.sampled.toLocaleString()} samples`} />
            <Stat label="Purchase rate" value={pct(overallPurchase)} hint={`${totals.purchased.toLocaleString()} purchases`} />
            <Stat label="Hide rate" value={pct(overallHide)} hint={`${totals.hidden.toLocaleString()} hides`} />
          </>
        )}
      </div>

      {/* Rail performance */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Rail performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-40" />
          ) : rails.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              No recommendation impressions yet in this window.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b border-border">
                  <tr className="text-left">
                    <th className="py-2 pr-3">Rail</th>
                    <th className="py-2 pr-3">Context</th>
                    <th className="py-2 pr-3 text-right">Shown</th>
                    <th className="py-2 pr-3 text-right">CTR</th>
                    <th className="py-2 pr-3 text-right">Sample</th>
                    <th className="py-2 pr-3 text-right">Purchase</th>
                    <th className="py-2 pr-3 text-right">Hide</th>
                    <th className="py-2 pr-3 text-right">Users</th>
                    <th className="py-2 text-right">Listings</th>
                  </tr>
                </thead>
                <tbody>
                  {rails.map((r, i) => {
                    const underperforming = r.shown >= 50 && r.ctr < 0.02;
                    const noisy = r.shown >= 50 && r.hide_rate > 0.15;
                    return (
                      <tr key={`${r.source}-${r.context}-${i}`} className="border-b border-border/60 hover:bg-muted/30">
                        <td className="py-2 pr-3 font-medium">
                          <div className="flex items-center gap-2">
                            <span>{r.source}</span>
                            {underperforming && <Badge variant="outline" className="text-[10px]">low CTR</Badge>}
                            {noisy && <Badge variant="destructive" className="text-[10px]">noisy</Badge>}
                          </div>
                        </td>
                        <td className="py-2 pr-3 text-xs text-muted-foreground">{r.context}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{r.shown.toLocaleString()}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{pct(r.ctr)}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{pct(r.sample_rate)}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{pct(r.purchase_rate)}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{pct(r.hide_rate)}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{r.unique_users.toLocaleString()}</td>
                        <td className="py-2 text-right tabular-nums">{r.unique_listings.toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Diversity */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            Diversity
            {concentrationWarn && (
              <Badge variant="destructive" className="text-[10px]">
                <AlertTriangle className="h-3 w-3 mr-1" /> high concentration
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading || !diversity ? (
            <Skeleton className="h-40" />
          ) : diversity.total_impressions === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">No impressions yet.</div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <Stat label="Unique authors shown" value={diversity.unique_authors} />
                <Stat label="Unique categories" value={diversity.unique_categories} />
                <Stat
                  label="Top-5 author share"
                  value={pct(diversity.top5_author_share)}
                  hint={concentrationWarn ? "Consider raising diversity cap" : "Healthy"}
                />
                <Stat label="Total impressions" value={diversity.total_impressions.toLocaleString()} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2">Top authors</div>
                  <div className="space-y-1">
                    {diversity.authors.map((a) => (
                      <div key={a.author_user_id} className="flex items-center justify-between text-sm gap-2">
                        <span className="truncate">{a.display_name}</span>
                        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                          {a.impressions.toLocaleString()} · {pct(a.share)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2">Top categories</div>
                  <div className="space-y-1">
                    {diversity.categories.map((c) => (
                      <div key={c.category} className="flex items-center justify-between text-sm gap-2">
                        <span className="truncate">{c.category}</span>
                        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                          {c.impressions.toLocaleString()} · {pct(c.share)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Discovery weight tuning */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Discovery scoring weights</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-40" />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {weights.map((w) => {
                const dirty = drafts[w.key] !== String(w.value);
                return (
                  <div key={w.key} className="flex items-center gap-2 rounded-md border border-border p-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium font-mono">{w.key}</div>
                      {w.description && (
                        <div className="text-[11px] text-muted-foreground truncate">{w.description}</div>
                      )}
                    </div>
                    <Input
                      type="number"
                      step="0.1"
                      min={0}
                      max={1000}
                      value={drafts[w.key] ?? ""}
                      onChange={(e) => setDrafts((d) => ({ ...d, [w.key]: e.target.value }))}
                      className="w-24 text-foreground caret-foreground"
                    />
                    <Button
                      size="sm"
                      variant={dirty ? "default" : "outline"}
                      disabled={!dirty || savingKey === w.key}
                      onClick={() => saveWeight(w.key)}
                    >
                      <Save className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground mt-3">
            Changes audited via <span className="font-mono">admin_update_discovery_weight</span> and take effect
            on the next discovery score computation.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
