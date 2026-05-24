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
import { RefreshCw, ShieldCheck, CreditCard, AlertTriangle, Crown } from "lucide-react";

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
  return new Intl.NumberFormat("en-DE", {
    style: "currency",
    currency: "EUR",
  }).format((cents || 0) / 100);
}

function TierBadge({ tier }: { tier: string }) {
  if (tier === "creator_pro") {
    return <Badge className="bg-purple-600 hover:bg-purple-600"><Crown className="h-3 w-3 mr-1" />Creator Pro</Badge>;
  }

  if (tier === "creator") {
    return <Badge><ShieldCheck className="h-3 w-3 mr-1" />Creator</Badge>;
  }

  return <Badge variant="secondary">Free</Badge>;
}

export function AdminEntitlementsTab() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [overview, setOverview] = useState<OverviewRow | null>(null);
  const [rows, setRows] = useState<CreatorEntitlementRow[]>([]);
  const [selected, setSelected] = useState<CreatorEntitlementRow | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("");

  const load = async () => {
    setRefreshing(true);

    const [overviewRes, rowsRes] = await Promise.all([
      supabase.from("admin_creator_subscription_overview").select("*").maybeSingle(),
      supabase.rpc("admin_get_creator_entitlements", {
        _search: search || null,
        _tier: tierFilter || null,
        _payment_status: null,
        _limit: 50,
        _offset: 0,
      }),
    ]);

    if (overviewRes.error) {
      toast.error("Failed loading overview");
    }

    if (rowsRes.error) {
      toast.error(rowsRes.error.message || "Failed loading entitlements");
    }

    setOverview((overviewRes.data as OverviewRow) || null);
    setRows((rowsRes.data as CreatorEntitlementRow[]) || []);

    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    load();
  }, []);

  const totalCount = useMemo(() => rows[0]?.total_count || rows.length || 0, [rows]);

  const loadDetail = async (userId: string) => {
    const { data, error } = await supabase.rpc("admin_get_creator_entitlement_detail", {
      _target_user_id: userId,
    });

    if (error) {
      toast.error(error.message || "Failed loading detail");
      return;
    }

    setDetail(data);
  };

  const overrideTier = async (userId: string, tier: string) => {
    const reason = window.prompt(`Reason for setting tier to ${tier}?`) || "Admin override";

    const { error } = await supabase.rpc("admin_override_creator_entitlement", {
      _target_user_id: userId,
      _new_tier: tier,
      _reason: reason,
    });

    if (error) {
      toast.error(error.message || "Override failed");
      return;
    }

    toast.success(`Tier updated to ${tier}`);
    await load();

    if (selected?.user_id === userId) {
      await loadDetail(userId);
    }
  };

  const requestResync = async (userId: string) => {
    const { error } = await supabase.rpc("admin_mark_creator_entitlement_resync_requested", {
      _target_user_id: userId,
    });

    if (error) {
      toast.error(error.message || "Resync request failed");
      return;
    }

    toast.success("Stripe resync requested");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold">Entitlements & subscriptions</h2>
          <p className="text-sm text-muted-foreground">
            Creator subscription oversight, Stripe sync state, grace periods, and publishing access.
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={load} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Active creators</div>
              <div className="text-2xl font-semibold mt-1">{overview?.active_creators || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Creator Pro</div>
              <div className="text-2xl font-semibold mt-1">{overview?.creator_pro_users || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Grace period</div>
              <div className="text-2xl font-semibold mt-1">{overview?.grace_period_users || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Failed payments</div>
              <div className="text-2xl font-semibold mt-1">{overview?.failed_payment_users || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Estimated MRR</div>
              <div className="text-2xl font-semibold mt-1">{formatMoney(overview?.estimated_mrr_cents)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Shopify connected</div>
              <div className="text-2xl font-semibold mt-1">{overview?.shopify_connected_creators || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Gumroad connected</div>
              <div className="text-2xl font-semibold mt-1">{overview?.gumroad_connected_creators || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">External publications</div>
              <div className="text-2xl font-semibold mt-1">{overview?.external_publications_count || 0}</div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Creator entitlements</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex flex-col md:flex-row gap-3">
            <Input
              placeholder="Search email, user ID, Stripe customer"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <div className="flex gap-2 flex-wrap">
              <Button variant={tierFilter === "" ? "default" : "outline"} size="sm" onClick={() => setTierFilter("")}>All</Button>
              <Button variant={tierFilter === "free" ? "default" : "outline"} size="sm" onClick={() => setTierFilter("free")}>Free</Button>
              <Button variant={tierFilter === "creator" ? "default" : "outline"} size="sm" onClick={() => setTierFilter("creator")}>Creator</Button>
              <Button variant={tierFilter === "creator_pro" ? "default" : "outline"} size="sm" onClick={() => setTierFilter("creator_pro")}>Creator Pro</Button>
              <Button size="sm" onClick={load}>Apply</Button>
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            {totalCount} creators found
          </div>

          <div className="rounded-md border overflow-hidden">
            <ScrollArea className="w-full">
              <div className="min-w-[1200px]">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 border-b">
                    <tr>
                      <th className="text-left p-3">Creator</th>
                      <th className="text-left p-3">Tier</th>
                      <th className="text-left p-3">Payment</th>
                      <th className="text-left p-3">Grace</th>
                      <th className="text-left p-3">Connections</th>
                      <th className="text-left p-3">Publications</th>
                      <th className="text-left p-3">Updated</th>
                      <th className="text-left p-3">Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.user_id} className="border-b align-top">
                        <td className="p-3">
                          <div className="font-medium">{row.email || "Unknown"}</div>
                          <div className="text-xs text-muted-foreground font-mono">
                            {row.user_id.slice(0, 8)}…
                          </div>
                        </td>

                        <td className="p-3">
                          <TierBadge tier={row.tier} />
                        </td>

                        <td className="p-3">
                          <Badge variant={row.payment_status === "active" ? "default" : "secondary"}>
                            <CreditCard className="h-3 w-3 mr-1" />
                            {row.payment_status}
                          </Badge>
                        </td>

                        <td className="p-3">
                          {row.grace_period_until ? (
                            <Badge variant="outline">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Until {new Date(row.grace_period_until).toLocaleDateString()}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>

                        <td className="p-3">
                          <div className="flex flex-col gap-1">
                            {row.shopify_connected && <Badge variant="outline">Shopify</Badge>}
                            {row.gumroad_connected && <Badge variant="outline">Gumroad</Badge>}
                            {!row.shopify_connected && !row.gumroad_connected && (
                              <span className="text-xs text-muted-foreground">None</span>
                            )}
                          </div>
                        </td>

                        <td className="p-3 font-medium">
                          {row.external_publications_count}
                        </td>

                        <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                          {row.updated_at ? new Date(row.updated_at).toLocaleString() : "—"}
                        </td>

                        <td className="p-3">
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" onClick={async () => {
                              setSelected(row);
                              await loadDetail(row.user_id);
                            }}>
                              Details
                            </Button>

                            <Button size="sm" variant="outline" onClick={() => requestResync(row.user_id)}>
                              Resync
                            </Button>

                            <Button size="sm" onClick={() => overrideTier(row.user_id, "creator")}>
                              Creator
                            </Button>

                            <Button size="sm" onClick={() => overrideTier(row.user_id, "creator_pro")}>
                              Pro
                            </Button>

                            <Button size="sm" variant="destructive" onClick={() => overrideTier(row.user_id, "free")}>
                              Free
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ScrollArea>
          </div>
        </CardContent>
      </Card>

      {selected && detail && (
        <Card>
          <CardHeader>
            <CardTitle>
              Entitlement detail — {selected.email || selected.user_id.slice(0, 8)}
            </CardTitle>
          </CardHeader>

          <CardContent>
            <Tabs defaultValue="subscription" className="space-y-4">
              <TabsList>
                <TabsTrigger value="subscription">Subscription</TabsTrigger>
                <TabsTrigger value="snapshots">Snapshots</TabsTrigger>
                <TabsTrigger value="audit">Audit</TabsTrigger>
                <TabsTrigger value="publications">Publications</TabsTrigger>
              </TabsList>

              <TabsContent value="subscription">
                <div className="grid md:grid-cols-2 gap-3 text-sm">
                  <div className="rounded-md border p-3">
                    <div className="text-muted-foreground text-xs">Stripe customer</div>
                    <div className="font-mono break-all mt-1">{detail?.user?.stripe_customer_id || "—"}</div>
                  </div>

                  <div className="rounded-md border p-3">
                    <div className="text-muted-foreground text-xs">Stripe price</div>
                    <div className="font-mono break-all mt-1">{detail?.user?.stripe_price_id || "—"}</div>
                  </div>

                  <div className="rounded-md border p-3">
                    <div className="text-muted-foreground text-xs">Current period end</div>
                    <div className="mt-1">{detail?.user?.current_period_end ? new Date(detail.user.current_period_end).toLocaleString() : "—"}</div>
                  </div>

                  <div className="rounded-md border p-3">
                    <div className="text-muted-foreground text-xs">Grace period</div>
                    <div className="mt-1">{detail?.user?.grace_period_until ? new Date(detail.user.grace_period_until).toLocaleString() : "—"}</div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="snapshots">
                <div className="space-y-2">
                  {(detail?.snapshots || []).map((s: any) => (
                    <div key={s.id} className="rounded-md border p-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <TierBadge tier={s.tier} />
                          <Badge variant="outline">{s.context_type}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(s.created_at).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="audit">
                <div className="space-y-2">
                  {(detail?.audit_events || []).map((a: any) => (
                    <div key={a.id} className="rounded-md border p-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-medium">{a.event_type}</div>
                          <div className="text-muted-foreground text-xs mt-1">{a.message}</div>
                        </div>

                        <Badge variant="outline">{a.severity}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="publications">
                <div className="space-y-2">
                  {(detail?.publications || []).map((p: any) => (
                    <div key={p.id} className="rounded-md border p-3 text-sm flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium">{p.platform}</div>
                        <div className="text-xs text-muted-foreground">{p.status}</div>
                      </div>

                      <Badge variant="outline">{p.sync_state}</Badge>
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
