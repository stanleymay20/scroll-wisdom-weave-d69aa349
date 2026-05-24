/**
 * CreatorIntelligence — Phase 3.1 publishing intelligence dashboard.
 * Channel performance, funnel (generated→published→purchased), and channel suggestions.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, TrendingUp, BarChart3, AlertTriangle } from "lucide-react";
import {
  fetchPublishingAnalytics,
  fetchPublishingFunnel,
  fetchChannelRecommendations,
  type PublishingAnalytics,
  type PublishingFunnel,
  type ChannelSuggestion,
} from "@/lib/creatorIntelligence";

const fmtUsd = (c: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((c ?? 0) / 100);

export default function CreatorIntelligence() {
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<PublishingAnalytics | null>(null);
  const [funnel, setFunnel] = useState<PublishingFunnel | null>(null);
  const [suggestions, setSuggestions] = useState<ChannelSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Publishing intelligence — ScrollLibrary";
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id;
        if (!uid) {
          setError("Sign in required");
          return;
        }
        const [a, f, r] = await Promise.all([
          fetchPublishingAnalytics(uid, 30),
          fetchPublishingFunnel(uid, 30),
          fetchChannelRecommendations(uid, 60),
        ]);
        setAnalytics(a);
        setFunnel(f);
        setSuggestions(r?.suggestions ?? []);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="container mx-auto max-w-6xl py-8 px-4 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="container mx-auto max-w-6xl py-8 px-4">
        <Card><CardContent className="p-6 text-destructive flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {error}
        </CardContent></Card>
      </div>
    );
  }

  const funnelSteps = funnel ? [
    { label: "Generated", value: funnel.generated },
    { label: "Published", value: funnel.published },
    { label: "Viewed", value: funnel.viewed },
    { label: "Sampled", value: funnel.sampled },
    { label: "CTA", value: funnel.cta },
    { label: "Checkout", value: funnel.checkout },
    { label: "Purchased", value: funnel.purchased },
    { label: "Refunded", value: funnel.refunded },
  ] : [];
  const max = funnelSteps.length ? Math.max(...funnelSteps.map((s) => s.value), 1) : 1;

  return (
    <div className="container mx-auto max-w-6xl py-8 px-4 space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Publishing intelligence</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Channel performance, funnel, and recommendations over the last 30 days.
        </p>
      </div>

      {/* Revenue summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="w-4 h-4" /> Net revenue (30d)
          </CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">
            {fmtUsd(analytics?.revenue?.net_cents ?? 0)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Sales</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">
            {analytics?.revenue?.sales ?? 0}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Followers gained</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">
            {funnel?.followers_gained ?? 0}
          </CardContent>
        </Card>
      </div>

      {/* Channel performance */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4" /> Channel performance
        </CardTitle></CardHeader>
        <CardContent>
          {!analytics?.channels?.length ? (
            <p className="text-sm text-muted-foreground">No exports or publications yet. Start by exporting a bundle from a book.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground">
                  <tr className="text-left border-b">
                    <th className="py-2 pr-3">Channel</th>
                    <th className="py-2 pr-3">Exports</th>
                    <th className="py-2 pr-3">Completed</th>
                    <th className="py-2 pr-3">Failed</th>
                    <th className="py-2 pr-3">Avg time</th>
                    <th className="py-2 pr-3">Published</th>
                    <th className="py-2 pr-3">Live</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.channels.map((c) => {
                    const failed = c.exports_failed > 0;
                    return (
                      <tr key={c.channel} className="border-b last:border-0">
                        <td className="py-2 pr-3 font-medium capitalize">{c.channel}</td>
                        <td className="py-2 pr-3">{c.exports_total}</td>
                        <td className="py-2 pr-3">{c.exports_completed}</td>
                        <td className="py-2 pr-3">
                          {failed
                            ? <Badge variant="destructive">{c.exports_failed}</Badge>
                            : <span className="text-muted-foreground">0</span>}
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground">
                          {c.time_to_publish_seconds ? `${Math.round(c.time_to_publish_seconds)}s` : "—"}
                        </td>
                        <td className="py-2 pr-3">{c.publications}</td>
                        <td className="py-2 pr-3">
                          {c.live > 0 ? <Badge>{c.live}</Badge> : <span className="text-muted-foreground">0</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Funnel */}
      <Card>
        <CardHeader><CardTitle>Publishing funnel</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {funnelSteps.map((s) => (
            <div key={s.label} className="flex items-center gap-3">
              <div className="w-24 text-sm text-muted-foreground">{s.label}</div>
              <div className="flex-1 h-6 bg-muted rounded overflow-hidden">
                <div
                  className="h-full bg-primary/70"
                  style={{ width: `${(s.value / max) * 100}%` }}
                />
              </div>
              <div className="w-16 text-right text-sm tabular-nums">{s.value}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Channel recommendations */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2">
          <Sparkles className="w-4 h-4" /> Channel recommendations
        </CardTitle></CardHeader>
        <CardContent>
          {!suggestions.length ? (
            <p className="text-sm text-muted-foreground">
              Not enough cross-channel data yet. Try exporting bundles to a few platforms and check back.
            </p>
          ) : (
            <ul className="space-y-2">
              {suggestions.map((s, i) => (
                <li key={i} className="flex items-center justify-between border rounded-lg px-3 py-2">
                  <div>
                    <div className="font-medium capitalize">{s.category} → {s.channel}</div>
                    <div className="text-xs text-muted-foreground">{s.reason}</div>
                  </div>
                  <Badge variant="secondary">{s.live} live / {s.publications} pub</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
