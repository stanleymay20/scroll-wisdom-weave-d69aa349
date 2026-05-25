import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { RefreshCw, ShieldCheck, CreditCard, Crown, Wallet, TrendingUp, Ban } from "lucide-react";

interface OverviewRow {
  active_creators: number;
  creator_users: number;
  creator_pro_users: number;
  grace_period_users: number;
  failed_payment_users: number;
  estimated_mrr_cents: number;
  shopify_connected_creators: number;
  gumroad_connected_creators: number;
  external_publications_count: number;
}

interface AnalyticsRow {
  overview?: {
    active_creators?: number;
    creator_pro_users?: number;
    grace_period_users?: number;
    failed_payment_users?: number;
    estimated_mrr_cents?: number;
    estimated_arr_cents?: number;
  };
  blocked_publishing?: { count?: number; latest_at?: string | null };
  grace_watchlist?: Array<{ user_id: string; email: string | null; tier: string; payment_status: string; grace_period_until: string | null }>;
  top_publishers?: Array<{ user_id: string; email: string | null; tier: string; external_publications_count: number; creator_revenue_cents: number; platform_fee_cents: number }>;
}

interface CreatorEntitlementRow {
  user_id: string;
  email: string | null;
  tier: string;
  payment_status: string;
  grace_period_until: string | null;
  current_period_end: string | null;
  stripe_customer_id: string | null;
  stripe_price_id: string | null;
  source: string | null;
  created_at: string | null;
  updated_at: string | null;
  shopify_connected: boolean;
  gumroad_connected: boolean;
  external_publications_count: number;
  latest_publish_blocked_at: string | null;
  total_count: number;
}

function formatMoney(cents?: number | null) {
  return new Intl.NumberFormat("en-DE", { style: "currency", currency: "EUR" }).format((cents || 0) / 100);
}

function TierBadge({ tier }: { tier: string }) {
  if (tier === "creator_pro") return <Badge className="bg-purple-600 hover:bg-purple-600"><Crown className="h-3 w-3 mr-1" />Creator Pro</Badge>;
  if (tier === "creator") return <Badge><ShieldCheck className="h-3 w-3 mr-1" />Creator</Badge>;
  return <Badge variant="secondary">Free</Badge>;
}

export function AdminEntitlementsTab() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [overview, setOverview] = useState<OverviewRow | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsRow | null>(null);
  const [rows, setRows] = useState<CreatorEntitlementRow[]>([]);
  const [selected, setSelected] = useState<CreatorEntitlementRow | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("");

  const load = async () => {
    setRefreshing(true);
    const sb = supabase as any;
    const [overviewRes, rowsRes, analyticsRes] = await Promise.all([
      sb.from("admin_creator_subscription_overview").select("*").maybeSingle(),
      sb.rpc("admin_get_creator_entitlements", {
        _search: search || null,
        _tier: tierFilter || null,
        _payment_status: null,
        _limit: 50,
        _offset: 0,
      }),
      sb.rpc("admin_get_creator_subscription_analytics", { _days: 30 }),
    ]);

    setOverview((overviewRes.data as OverviewRow) || null);
    setRows((rowsRes.data as CreatorEntitlementRow[]) || []);
    setAnalytics((analyticsRes.data as AnalyticsRow) || null);
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { load(); }, []);

  const totalCount = useMemo(() => rows[0]?.total_count || rows.length || 0, [rows]);

  const loadDetail = async (userId: string) => {
    const { data } = await supabase.rpc("admin_get_creator_entitlement_detail", { _target_user_id: userId });
    setDetail(data);
  };

  const overrideTier = async (userId: string, tier: string) => {
    const reason = window.prompt(`Reason for setting tier to ${tier}?`) || "Admin override";
    const { error } = await supabase.rpc("admin_override_creator_entitlement", {
      _target_user_id: userId,
      _new_tier: tier,
      _reason: reason,
    });
    if (error) return toast.error(error.message || "Override failed");
    toast.success(`Tier updated to ${tier}`);
    await load();
  };

  const requestResync = async (userId: string) => {
    toast.loading("Syncing Stripe subscription…", { id: `sync-${userId}` });
    const { data, error } = await supabase.functions.invoke("admin-force-stripe-resync", { body: { user_id: userId } });
    if (error) return toast.error(error.message || "Stripe resync failed", { id: `sync-${userId}` });
    toast.success(`Resynced as ${data?.tier || "unknown"}`, { id: `sync-${userId}` });
    await load();
    if (selected?.user_id === userId) await loadDetail(userId);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold">Entitlements & subscriptions</h2>
          <p className="text-sm text-muted-foreground">Creator subscription oversight, Stripe sync state, grace periods, and publishing access.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {loading ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />) : (
          <>
            <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><div className="text-xs text-muted-foreground">Estimated MRR</div><div className="text-2xl font-semibold mt-1">{formatMoney(analytics?.overview?.estimated_mrr_cents ?? overview?.estimated_mrr_cents)}</div></div><Wallet className="h-5 w-5 text-muted-foreground" /></div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><div className="text-xs text-muted-foreground">Estimated ARR</div><div className="text-2xl font-semibold mt-1">{formatMoney(analytics?.overview?.estimated_arr_cents)}</div></div><TrendingUp className="h-5 w-5 text-muted-foreground" /></div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Grace period</div><div className="text-2xl font-semibold mt-1">{analytics?.overview?.grace_period_users ?? overview?.grace_period_users ?? 0}</div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><div className="text-xs text-muted-foreground">Publishing blocks</div><div className="text-2xl font-semibold mt-1">{analytics?.blocked_publishing?.count || 0}</div></div><Ban className="h-5 w-5 text-muted-foreground" /></div></CardContent></Card>
          </>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Grace period watchlist</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(analytics?.grace_watchlist || []).length === 0 ? <div className="text-sm text-muted-foreground">No creators currently in grace period.</div> : analytics?.grace_watchlist?.map((g) => (
              <div key={g.user_id} className="rounded-md border p-3 flex items-center justify-between gap-3">
                <div><div className="font-medium text-sm">{g.email || g.user_id.slice(0, 8)}</div><div className="text-xs text-muted-foreground mt-1">Grace until {g.grace_period_until ? new Date(g.grace_period_until).toLocaleDateString() : "—"}</div></div>
                <div className="flex items-center gap-2"><TierBadge tier={g.tier} /><Badge variant="outline">{g.payment_status}</Badge></div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Top creator monetization</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(analytics?.top_publishers || []).length === 0 ? <div className="text-sm text-muted-foreground">No creator revenue activity yet.</div> : analytics?.top_publishers?.map((p) => (
              <div key={p.user_id} className="rounded-md border p-3 flex items-center justify-between gap-3">
                <div><div className="font-medium text-sm">{p.email || p.user_id.slice(0, 8)}</div><div className="text-xs text-muted-foreground mt-1">{p.external_publications_count} external publications</div></div>
                <div className="text-right"><div className="font-semibold text-sm">{formatMoney(p.creator_revenue_cents)}</div><div className="text-xs text-muted-foreground">Platform fee: {formatMoney(p.platform_fee_cents)}</div></div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Creator entitlements ({totalCount})</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <Input placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
            <Button size="sm" variant={tierFilter === "" ? "default" : "outline"} onClick={() => setTierFilter("")}>All</Button>
            <Button size="sm" variant={tierFilter === "creator" ? "default" : "outline"} onClick={() => setTierFilter("creator")}>Creator</Button>
            <Button size="sm" variant={tierFilter === "creator_pro" ? "default" : "outline"} onClick={() => setTierFilter("creator_pro")}>Pro</Button>
            <Button size="sm" onClick={load}>Apply</Button>
          </div>

          <ScrollArea className="w-full"><div className="min-w-[1100px] space-y-2">
            {rows.map((row) => (
              <div key={row.user_id} className="rounded-md border p-3 flex items-start justify-between gap-4">
                <div><div className="font-medium">{row.email || "Unknown"}</div><div className="text-xs text-muted-foreground font-mono mt-1">{row.user_id.slice(0, 8)}…</div><div className="flex items-center gap-2 mt-2 flex-wrap"><TierBadge tier={row.tier} /><Badge variant="outline">{row.payment_status}</Badge>{row.shopify_connected && <Badge variant="outline">Shopify</Badge>}{row.gumroad_connected && <Badge variant="outline">Gumroad</Badge>}</div></div>
                <div className="flex gap-2 flex-wrap justify-end"><Button size="sm" variant="outline" onClick={async () => { setSelected(row); await loadDetail(row.user_id); }}>Details</Button><Button size="sm" variant="outline" onClick={() => requestResync(row.user_id)}>Resync</Button><Button size="sm" onClick={() => overrideTier(row.user_id, "creator")}>Creator</Button><Button size="sm" onClick={() => overrideTier(row.user_id, "creator_pro")}>Pro</Button><Button size="sm" variant="destructive" onClick={() => overrideTier(row.user_id, "free")}>Free</Button></div>
              </div>
            ))}
          </div></ScrollArea>
        </CardContent>
      </Card>

      {selected && detail && <Card><CardHeader><CardTitle>Entitlement detail — {selected.email || selected.user_id.slice(0, 8)}</CardTitle></CardHeader><CardContent><Tabs defaultValue="snapshots"><TabsList><TabsTrigger value="snapshots">Snapshots</TabsTrigger><TabsTrigger value="audit">Audit</TabsTrigger></TabsList><TabsContent value="snapshots" className="space-y-2 mt-4">{(detail?.snapshots || []).map((s: any) => <div key={s.id} className="rounded-md border p-3 flex items-center justify-between gap-3"><div className="flex items-center gap-2"><TierBadge tier={s.tier} /><Badge variant="outline">{s.context_type}</Badge></div><div className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleString()}</div></div>)}</TabsContent><TabsContent value="audit" className="space-y-2 mt-4">{(detail?.audit_events || []).map((a: any) => <div key={a.id} className="rounded-md border p-3 flex items-center justify-between gap-3"><div><div className="font-medium">{a.event_type}</div><div className="text-xs text-muted-foreground mt-1">{a.message}</div></div><Badge variant="outline">{a.severity}</Badge></div>)}</TabsContent></Tabs></CardContent></Card>}
    </div>
  );
}
