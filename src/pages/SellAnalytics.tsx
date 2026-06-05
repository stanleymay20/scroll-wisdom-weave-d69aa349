/**
 * SellAnalytics — Marketplace funnel + author drop-off dashboard.
 * Reuses get_creator_publishing_funnel + get_creator_publishing_analytics.
 * Focus: Views → Samples → CTA → Checkout → Buys + revenue rollup, with
 * drop-off rates between stages so authors can see exactly where they lose readers.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ResponsiveShell } from "@/components/layout/ResponsiveShell";
import { SEO } from "@/components/SEO";
import {
  fetchPublishingFunnel,
  fetchPublishingAnalytics,
  type PublishingFunnel,
  type PublishingAnalytics,
} from "@/lib/creatorIntelligence";
import { Eye, BookOpen, MousePointerClick, CreditCard, CheckCircle2, TrendingUp, Wallet, Users, AlertCircle } from "lucide-react";

const WINDOWS: { label: string; days: number }[] = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

const fmtUsd = (c: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((c ?? 0) / 100);

const pct = (num: number, den: number) =>
  den > 0 ? `${((num / den) * 100).toFixed(1)}%` : "—";

interface Stage {
  key: string;
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  hint: string;
}

export default function SellAnalytics() {
  const [windowDays, setWindowDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [funnel, setFunnel] = useState<PublishingFunnel | null>(null);
  const [analytics, setAnalytics] = useState<PublishingAnalytics | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id;
        if (!uid) { setError("Sign in required"); return; }
        const [f, a] = await Promise.all([
          fetchPublishingFunnel(uid, windowDays),
          fetchPublishingAnalytics(uid, windowDays),
        ]);
        if (cancelled) return;
        setFunnel(f);
        setAnalytics(a);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load analytics");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [windowDays]);

  const stages: Stage[] = useMemo(() => {
    if (!funnel) return [];
    return [
      { key: "viewed",    label: "Views",       value: funnel.viewed,    icon: Eye,                hint: "Store page opens" },
      { key: "sampled",   label: "Samples",     value: funnel.sampled,   icon: BookOpen,           hint: "Opened the free sample" },
      { key: "cta",       label: "CTA clicks",  value: funnel.cta,       icon: MousePointerClick,  hint: "Tapped Buy / Get free copy" },
      { key: "checkout",  label: "Checkout",    value: funnel.checkout,  icon: CreditCard,         hint: "Started Stripe checkout" },
      { key: "purchased", label: "Buys",        value: funnel.purchased, icon: CheckCircle2,       hint: "Completed purchase / free claim" },
    ];
  }, [funnel]);

  const maxStage = stages[0]?.value ?? 0;
  const topConversion = stages.length && stages[0].value > 0
    ? stages[stages.length - 1].value / stages[0].value
    : 0;

  return (
    <ResponsiveShell>
      <SEO title="Marketplace analytics — ScrollLibrary" description="Track views, samples, buys and revenue for your books." canonical="/sell/analytics" />
      <div className="container mx-auto max-w-6xl px-4 py-8 space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Marketplace analytics</h1>
            <p className="text-muted-foreground mt-1">
              See where readers drop off — from store view to purchase.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {WINDOWS.map((w) => (
              <Button
                key={w.days}
                size="sm"
                variant={w.days === windowDays ? "default" : "outline"}
                onClick={() => setWindowDays(w.days)}
              >
                {w.label}
              </Button>
            ))}
            <Button asChild variant="ghost" size="sm">
              <Link to="/account/earnings">Earnings →</Link>
            </Button>
          </div>
        </header>

        {error && (
          <Card>
            <CardContent className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4" />
              {error}
            </CardContent>
          </Card>
        )}

        {loading && !error ? (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : !error && funnel && analytics ? (
          <>
            {/* KPI strip */}
            <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard
                icon={Eye}
                label="Views"
                value={funnel.viewed.toLocaleString()}
                sub={`${funnel.published} listed · ${funnel.generated} new`}
              />
              <KpiCard
                icon={TrendingUp}
                label="View → Buy"
                value={pct(funnel.purchased, funnel.viewed)}
                sub={`${funnel.purchased} buys / ${funnel.viewed} views`}
              />
              <KpiCard
                icon={Wallet}
                label="Net revenue"
                value={fmtUsd(analytics.revenue.net_cents)}
                sub={`${analytics.revenue.sales} sales · ${analytics.revenue.refunds} refunds`}
              />
              <KpiCard
                icon={Users}
                label="New followers"
                value={funnel.followers_gained.toLocaleString()}
                sub={`In last ${windowDays} days`}
              />
            </section>

            {/* Funnel */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Author funnel</CardTitle>
              </CardHeader>
              <CardContent>
                {maxStage === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No activity yet in this window. Share your store link to start collecting data.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {stages.map((s, i) => {
                      const widthPct = maxStage > 0 ? (s.value / maxStage) * 100 : 0;
                      const prev = i > 0 ? stages[i - 1].value : null;
                      const dropOff = prev !== null && prev > 0
                        ? 1 - s.value / prev
                        : null;
                      const Icon = s.icon;
                      return (
                        <div key={s.key}>
                          <div className="flex items-center justify-between text-sm mb-1">
                            <div className="flex items-center gap-2">
                              <Icon className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{s.label}</span>
                              <span className="text-muted-foreground hidden sm:inline">· {s.hint}</span>
                            </div>
                            <div className="flex items-center gap-2 tabular-nums">
                              <span className="font-semibold">{s.value.toLocaleString()}</span>
                              {dropOff !== null && (
                                <Badge
                                  variant={dropOff > 0.7 ? "destructive" : dropOff > 0.5 ? "secondary" : "outline"}
                                  className="text-xs"
                                >
                                  {dropOff > 0 ? `−${(dropOff * 100).toFixed(0)}%` : `+${(-dropOff * 100).toFixed(0)}%`}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="h-3 w-full bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all"
                              style={{
                                width: `${Math.max(widthPct, 2)}%`,
                                transitionDuration: "600ms",
                                transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                    <div className="pt-2 text-sm text-muted-foreground flex flex-wrap gap-x-6 gap-y-1">
                      <span>View → Sample: <span className="font-medium text-foreground">{pct(funnel.sampled, funnel.viewed)}</span></span>
                      <span>Sample → CTA: <span className="font-medium text-foreground">{pct(funnel.cta, funnel.sampled)}</span></span>
                      <span>CTA → Checkout: <span className="font-medium text-foreground">{pct(funnel.checkout, funnel.cta)}</span></span>
                      <span>Checkout → Buy: <span className="font-medium text-foreground">{pct(funnel.purchased, funnel.checkout)}</span></span>
                      <span>Overall: <span className="font-medium text-foreground">{(topConversion * 100).toFixed(2)}%</span></span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Channel breakdown */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Where your books live</CardTitle>
              </CardHeader>
              <CardContent>
                {analytics.channels.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No publishing activity yet. <Link to="/sell" className="text-primary underline">Publish your first book</Link>.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-muted-foreground">
                        <tr>
                          <th className="py-2 pr-4">Channel</th>
                          <th className="py-2 pr-4 text-right">Exports</th>
                          <th className="py-2 pr-4 text-right">Failed</th>
                          <th className="py-2 pr-4 text-right">Live</th>
                          <th className="py-2 pr-4 text-right">Median TTPublish</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.channels.map((c) => (
                          <tr key={c.channel} className="border-t border-border">
                            <td className="py-2 pr-4 font-medium capitalize">{c.channel}</td>
                            <td className="py-2 pr-4 text-right tabular-nums">{c.exports_completed}/{c.exports_total}</td>
                            <td className="py-2 pr-4 text-right tabular-nums">{c.exports_failed}</td>
                            <td className="py-2 pr-4 text-right tabular-nums">{c.live}/{c.publications}</td>
                            <td className="py-2 pr-4 text-right tabular-nums">
                              {c.time_to_publish_seconds > 0
                                ? `${Math.round(c.time_to_publish_seconds / 60)}m`
                                : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <p className="text-xs text-muted-foreground text-center">
              Window: {windowDays} days · generated {new Date(funnel.generated_at).toLocaleString()}
            </p>
          </>
        ) : null}
      </div>
    </ResponsiveShell>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon className="h-4 w-4" />
          {label}
        </div>
        <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
        {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}
