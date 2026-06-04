/**
 * CreatorBusinessHub — M1 of Phase 5.
 * The creator command center: revenue, audience, sales, distribution, AI intelligence.
 * Route: /creator/business
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TrendingUp, TrendingDown, Users, ShoppingCart, BarChart3,
  Sparkles, AlertTriangle, ArrowUpRight, BookOpen, Award, Heart,
} from "lucide-react";
import { SEO } from "@/components/SEO";

const fmtUsd = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })
    .format((cents ?? 0) / 100);
const fmtNum = (n: number) => new Intl.NumberFormat("en-US").format(n ?? 0);
const fmtPct = (n: number | null | undefined, digits = 1) =>
  n == null ? "—" : `${n.toFixed(digits)}%`;

type Recommendation = {
  category: string;
  title: string;
  rationale: string;
  priority: "high" | "medium" | "low";
  expected_impact?: string;
};

export default function CreatorBusinessHub() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revenue, setRevenue] = useState<any>(null);
  const [audience, setAudience] = useState<any>(null);
  const [sales, setSales] = useState<any>(null);
  const [publishing, setPublishing] = useState<any>(null);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [recsLoading, setRecsLoading] = useState(false);
  const [recsError, setRecsError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Creator Business Hub — ScrollLibrary";
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id;
        if (!uid) { setError("Sign in to view your business hub."); setLoading(false); return; }

        const [rev, aud, sal, pub] = await Promise.all([
          supabase.rpc("get_creator_revenue_summary", { _user_id: uid, _window_days: 30 }),
          supabase.rpc("get_creator_audience_summary", { _user_id: uid, _window_days: 30 }),
          supabase.rpc("get_creator_sales_conversion", { _user_id: uid, _window_days: 30 }),
          supabase.rpc("get_creator_publishing_analytics", { _user_id: uid, _window_days: 30 }),
        ]);
        if (rev.error) throw rev.error;
        setRevenue(rev.data);
        setAudience(aud.data);
        setSales(sal.data);
        setPublishing(pub.data);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function generateRecommendations() {
    setRecsLoading(true);
    setRecsError(null);
    try {
      const { data, error } = await supabase.functions.invoke("creator-intelligence-synthesis");
      if (error) throw error;
      if ((data as any)?.error === "ai_credits_exhausted") {
        setRecsError("AI credits exhausted. Add credits in Settings to generate recommendations.");
        return;
      }
      setRecs((data as any)?.recommendations ?? []);
    } catch (e: any) {
      setRecsError(e?.message ?? "Failed to generate recommendations");
    } finally {
      setRecsLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto max-w-7xl py-8 px-4 space-y-4">
        <Skeleton className="h-10 w-72" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[0,1,2,3].map(i => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="container mx-auto max-w-3xl py-12 px-4">
        <Card><CardContent className="p-6 flex items-center gap-3 text-destructive">
          <AlertTriangle className="w-5 h-5" /> {error}
        </CardContent></Card>
      </div>
    );
  }

  const lifetime = revenue?.lifetime ?? {};
  const growth = revenue?.growth_pct;
  const trend: { day: string; net_cents: number }[] = revenue?.daily_trend ?? [];
  const maxNet = Math.max(1, ...trend.map(t => t.net_cents));

  return (
    <>
      <SEO
        title="Creator Business Hub — ScrollLibrary"
        description="Your command center for revenue, audience, sales, distribution and AI-powered creator intelligence."
      />
      <div className="container mx-auto max-w-7xl py-8 px-4 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Creator Business Hub</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Your knowledge commerce command center. Last 30 days.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/account/earnings">Earnings detail <ArrowUpRight className="w-3.5 h-3.5 ml-1" /></Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/account/intelligence">Publishing intelligence <ArrowUpRight className="w-3.5 h-3.5 ml-1" /></Link>
            </Button>
          </div>
        </div>

        {/* Hero stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={<TrendingUp className="w-4 h-4" />}
            label="Lifetime net revenue"
            value={fmtUsd(lifetime.lifetime_net_cents ?? 0)}
            sub={`${fmtNum(lifetime.lifetime_sales ?? 0)} lifetime sales`}
          />
          <StatCard
            icon={<BarChart3 className="w-4 h-4" />}
            label="MRR (30d net)"
            value={fmtUsd(revenue?.window_net_cents ?? 0)}
            sub={growth == null ? "No prior period" : (
              <span className={growth >= 0 ? "text-emerald-600" : "text-destructive"}>
                {growth >= 0 ? <TrendingUp className="inline w-3 h-3" /> : <TrendingDown className="inline w-3 h-3" />}
                {" "}{growth >= 0 ? "+" : ""}{growth}% vs prior 30d
              </span>
            )}
          />
          <StatCard
            icon={<Users className="w-4 h-4" />}
            label="Followers"
            value={fmtNum(audience?.total_followers ?? 0)}
            sub={`+${fmtNum(audience?.new_followers ?? 0)} new this month`}
          />
          <StatCard
            icon={<ShoppingCart className="w-4 h-4" />}
            label="Lifetime customers"
            value={fmtNum(audience?.lifetime_customers ?? 0)}
            sub={`${fmtNum(audience?.active_learners ?? 0)} active learners`}
          />
        </div>

        <Tabs defaultValue="revenue" className="space-y-4">
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="revenue">Revenue</TabsTrigger>
            <TabsTrigger value="audience">Audience</TabsTrigger>
            <TabsTrigger value="sales">Sales</TabsTrigger>
            <TabsTrigger value="distribution">Distribution</TabsTrigger>
            <TabsTrigger value="intelligence">
              <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Intelligence
            </TabsTrigger>
          </TabsList>

          {/* REVENUE */}
          <TabsContent value="revenue" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Daily net revenue (90 days)</CardTitle></CardHeader>
              <CardContent>
                {trend.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No revenue yet. Publish a book and share it to start earning.</p>
                ) : (
                  <div className="flex items-end gap-[2px] h-40">
                    {trend.map((t, i) => (
                      <div key={i} className="flex-1 bg-primary/70 rounded-sm hover:bg-primary transition-colors"
                        style={{ height: `${(t.net_cents / maxNet) * 100}%`, minHeight: "1px" }}
                        title={`${t.day}: ${fmtUsd(t.net_cents)}`} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="w-4 h-4" /> Top performing books
              </CardTitle></CardHeader>
              <CardContent>
                {(revenue?.top_books ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No sales yet.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="text-muted-foreground text-left border-b">
                      <tr><th className="py-2">Book</th><th className="py-2">Sales</th><th className="py-2 text-right">Net</th></tr>
                    </thead>
                    <tbody>
                      {(revenue.top_books as any[]).map((b) => (
                        <tr key={b.book_id} className="border-b last:border-0">
                          <td className="py-2">
                            <Link to={`/book/${b.book_id}`} className="hover:underline">{b.title}</Link>
                          </td>
                          <td className="py-2">{fmtNum(b.sales)}</td>
                          <td className="py-2 text-right font-medium tabular-nums">{fmtUsd(b.net_cents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* AUDIENCE */}
          <TabsContent value="audience" className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <StatCard icon={<Heart className="w-4 h-4" />} label="Total followers" value={fmtNum(audience?.total_followers ?? 0)} />
              <StatCard icon={<TrendingUp className="w-4 h-4" />} label="New followers (30d)" value={fmtNum(audience?.new_followers ?? 0)} />
              <StatCard icon={<Users className="w-4 h-4" />} label="Active learners (30d)" value={fmtNum(audience?.active_learners ?? 0)} />
              <StatCard icon={<BookOpen className="w-4 h-4" />} label="Returning readers" value={fmtNum(audience?.returning_readers ?? 0)} />
              <StatCard icon={<Award className="w-4 h-4" />} label="Certifications earned (30d)" value={fmtNum(audience?.certifications_earned ?? 0)} />
              <StatCard icon={<ShoppingCart className="w-4 h-4" />} label="Lifetime customers" value={fmtNum(audience?.lifetime_customers ?? 0)} />
            </div>
            <Card>
              <CardContent className="p-4 text-xs text-muted-foreground">
                Email subscriber list and CRM coming in Milestone 3 (Customer Ownership Layer).
              </CardContent>
            </Card>
          </TabsContent>

          {/* SALES */}
          <TabsContent value="sales" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Conversion funnel (30d)</CardTitle></CardHeader>
              <CardContent>
                <Funnel
                  steps={[
                    { label: "Views", value: sales?.views ?? 0 },
                    { label: "Samples", value: sales?.samples ?? 0 },
                    { label: "CTA clicks", value: sales?.ctas ?? 0 },
                    { label: "Checkouts", value: sales?.checkouts ?? 0 },
                    { label: "Purchases", value: sales?.purchases ?? 0 },
                  ]}
                />
              </CardContent>
            </Card>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <StatCard label="Storefront conversion" value={fmtPct(sales?.storefront_conversion_pct, 2)} />
              <StatCard label="Checkout conversion" value={fmtPct(sales?.checkout_conversion_pct)} />
              <StatCard label="Cart abandonment" value={fmtPct(sales?.cart_abandonment_pct)} />
              <StatCard label="Sample → purchase" value={fmtPct(sales?.sample_to_purchase_pct, 2)} />
              <StatCard label="Revenue per visitor" value={fmtUsd(sales?.revenue_per_visitor_cents ?? 0)} />
              <StatCard label="Revenue per follower" value={fmtUsd(sales?.revenue_per_follower_cents ?? 0)} />
            </div>
          </TabsContent>

          {/* DISTRIBUTION */}
          <TabsContent value="distribution" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Channel breakdown</CardTitle></CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead className="text-muted-foreground text-left border-b">
                    <tr><th className="py-2">Channel</th><th className="py-2">Status</th><th className="py-2 text-right">Detail</th></tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      <td className="py-2 font-medium">ScrollLibrary (direct)</td>
                      <td className="py-2"><Badge variant="default">Active</Badge></td>
                      <td className="py-2 text-right tabular-nums">
                        {fmtUsd(revenue?.by_channel?.scrolllibrary?.net_cents ?? 0)} · {fmtNum(revenue?.by_channel?.scrolllibrary?.sales ?? 0)} sales
                      </td>
                    </tr>
                    {(revenue?.by_channel?.external ?? []).map((c: any) => (
                      <tr key={c.channel} className="border-b last:border-0">
                        <td className="py-2 font-medium capitalize">{c.channel}</td>
                        <td className="py-2">
                          {c.live > 0 ? <Badge>{c.live} live</Badge> : <Badge variant="secondary">{c.publications} pub</Badge>}
                        </td>
                        <td className="py-2 text-right text-muted-foreground">External — track in publishing intelligence</td>
                      </tr>
                    ))}
                    {(revenue?.by_channel?.external ?? []).length === 0 && (
                      <tr><td colSpan={3} className="py-3 text-sm text-muted-foreground">
                        No external channels yet. Export bundles from a book to publish to Gumroad, Substack, Patreon, Etsy or KDP.
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* INTELLIGENCE */}
          <TabsContent value="intelligence" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="w-4 h-4" /> AI recommendations
                </CardTitle>
                <Button size="sm" onClick={generateRecommendations} disabled={recsLoading}>
                  {recsLoading ? "Analyzing…" : recs.length ? "Regenerate" : "Generate"}
                </Button>
              </CardHeader>
              <CardContent>
                {recsError && (
                  <div className="text-sm text-destructive flex items-center gap-2 mb-3">
                    <AlertTriangle className="w-4 h-4" /> {recsError}
                  </div>
                )}
                {!recs.length && !recsLoading && !recsError && (
                  <p className="text-sm text-muted-foreground">
                    Click <strong>Generate</strong> to get tailored recommendations based on your last 30 days of metrics
                    (pricing, content gaps, promotion, upsells, channel mix, conversion).
                  </p>
                )}
                {recs.length > 0 && (
                  <ul className="space-y-3">
                    {recs.map((r, i) => (
                      <li key={i} className="border rounded-lg p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="capitalize">{r.category}</Badge>
                              <Badge variant={r.priority === "high" ? "destructive" : r.priority === "medium" ? "default" : "secondary"}>
                                {r.priority}
                              </Badge>
                              {r.expected_impact && (
                                <span className="text-xs text-muted-foreground">{r.expected_impact}</span>
                              )}
                            </div>
                            <div className="font-medium">{r.title}</div>
                            <p className="text-sm text-muted-foreground">{r.rationale}</p>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

function StatCard({ icon, label, value, sub }: {
  icon?: React.ReactNode; label: string; value: React.ReactNode; sub?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
          {icon}{label}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const max = Math.max(1, ...steps.map(s => s.value));
  return (
    <div className="space-y-2">
      {steps.map((s) => (
        <div key={s.label} className="flex items-center gap-3">
          <div className="w-24 text-sm text-muted-foreground">{s.label}</div>
          <div className="flex-1 h-6 bg-muted rounded overflow-hidden">
            <div className="h-full bg-primary/70 transition-all" style={{ width: `${(s.value / max) * 100}%` }} />
          </div>
          <div className="w-16 text-right text-sm tabular-nums">{fmtNum(s.value)}</div>
        </div>
      ))}
    </div>
  );
}
