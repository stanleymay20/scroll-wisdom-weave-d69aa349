import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/useAdmin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ShieldCheck, TrendingUp, Clock, AlertTriangle, BarChart3, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TelemetryStats {
  totalAudits: number;
  passRate: number;
  avgDurationMs: number;
  avgImprovementDelta: number;
  penaltyDistribution: Record<string, number>;
  modelBreakdown: Record<string, number>;
  avgChaptersPerAudit: number;
  recentAudits: Array<{
    id: string;
    book_id: string;
    duration_ms: number;
    certification_result: boolean;
    chapters_audited: number;
    penalties_applied: number;
    improvement_delta: any;
    created_at: string;
    audit_model: string;
  }>;
}

export default function AuditDashboard() {
  const { isAdmin, isLoading: adminLoading } = useIsAdmin();
  const navigate = useNavigate();
  const [stats, setStats] = useState<TelemetryStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (adminLoading) return;
    if (!isAdmin) {
      navigate("/");
      return;
    }
    fetchTelemetry();
  }, [isAdmin, adminLoading]);

  async function fetchTelemetry() {
    try {
      const { data: telemetry, error } = await supabase
        .from("audit_telemetry")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);

      if (error || !telemetry) {
        setStats(null);
        setLoading(false);
        return;
      }

      const total = telemetry.length;
      const passed = telemetry.filter(t => t.certification_result).length;
      const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;

      const avgDuration = total > 0
        ? Math.round(telemetry.reduce((s, t) => s + (t.duration_ms || 0), 0) / total)
        : 0;

      const avgChapters = total > 0
        ? Math.round((telemetry.reduce((s, t) => s + (t.chapters_audited || 0), 0) / total) * 10) / 10
        : 0;

      // Improvement delta (only from re-audits that have delta)
      const withDelta = telemetry.filter(t => {
        const d = t.improvement_delta as any;
        return d && typeof d === "object" && typeof d.overall === "number";
      });
      const avgDelta = withDelta.length > 0
        ? Math.round((withDelta.reduce((s, t) => s + ((t.improvement_delta as any).overall || 0), 0) / withDelta.length) * 10) / 10
        : 0;

      // Penalty distribution from audits
      const { data: audits } = await supabase
        .from("book_audits")
        .select("penalty_log")
        .eq("status", "completed")
        .limit(200);

      const penaltyDist: Record<string, number> = {};
      if (audits) {
        for (const a of audits) {
          const penalties = a.penalty_log as any[];
          if (Array.isArray(penalties)) {
            for (const p of penalties) {
              penaltyDist[p.rule] = (penaltyDist[p.rule] || 0) + 1;
            }
          }
        }
      }

      // Model breakdown
      const modelBreakdown: Record<string, number> = {};
      for (const t of telemetry) {
        const m = t.audit_model || "unknown";
        modelBreakdown[m] = (modelBreakdown[m] || 0) + 1;
      }

      setStats({
        totalAudits: total,
        passRate,
        avgDurationMs: avgDuration,
        avgImprovementDelta: avgDelta,
        penaltyDistribution: penaltyDist,
        modelBreakdown,
        avgChaptersPerAudit: avgChapters,
        recentAudits: telemetry.slice(0, 10) as any,
      });
    } catch (err) {
      console.error("Telemetry fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }

  if (adminLoading || loading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    );
  }

  if (!isAdmin) return null;

  const penaltyEntries = stats
    ? Object.entries(stats.penaltyDistribution).sort((a, b) => b[1] - a[1])
    : [];

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-6xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Audit Quality Dashboard</h1>
          <p className="text-sm text-muted-foreground">Internal observability — founder only</p>
        </div>
        <Badge variant="outline" className="ml-auto">
          {stats?.totalAudits || 0} audits tracked
        </Badge>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Certification Pass Rate</CardTitle>
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.passRate ?? 0}%</div>
            <p className="text-xs text-muted-foreground mt-1">Target: 35–55%</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Avg Improvement Delta</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {stats?.avgImprovementDelta !== undefined
                ? (stats.avgImprovementDelta >= 0 ? "+" : "") + stats.avgImprovementDelta
                : "—"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Overall score change on re-audit</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Avg Audit Duration</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {stats?.avgDurationMs ? (stats.avgDurationMs / 1000).toFixed(1) + "s" : "—"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              ~{stats?.avgChaptersPerAudit || 0} chapters/audit
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Audits</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.totalAudits ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Last 200 records</p>
          </CardContent>
        </Card>
      </div>

      {/* Penalty Distribution + Model Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Top Penalty Rules
            </CardTitle>
          </CardHeader>
          <CardContent>
            {penaltyEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No penalty data yet</p>
            ) : (
              <div className="space-y-3">
                {penaltyEntries.slice(0, 6).map(([rule, count]) => {
                  const maxCount = penaltyEntries[0][1];
                  const pct = Math.round((count / maxCount) * 100);
                  return (
                    <div key={rule}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-mono text-xs">{rule}</span>
                        <span className="text-muted-foreground">{count}×</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Model & Prompt Versions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!stats?.modelBreakdown || Object.keys(stats.modelBreakdown).length === 0 ? (
              <p className="text-sm text-muted-foreground">No data yet</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(stats.modelBreakdown).map(([model, count]) => (
                  <div key={model} className="flex justify-between items-center">
                    <code className="text-xs bg-muted px-2 py-1 rounded">{model}</code>
                    <Badge variant="secondary">{count}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Audits Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Recent Audits</CardTitle>
        </CardHeader>
        <CardContent>
          {!stats?.recentAudits?.length ? (
            <p className="text-sm text-muted-foreground">No audits recorded yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4">Date</th>
                    <th className="pb-2 pr-4">Chapters</th>
                    <th className="pb-2 pr-4">Penalties</th>
                    <th className="pb-2 pr-4">Duration</th>
                    <th className="pb-2 pr-4">Delta</th>
                    <th className="pb-2">Certified</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentAudits.map(a => {
                    const delta = a.improvement_delta as any;
                    const deltaStr = delta?.overall != null ? (delta.overall >= 0 ? "+" : "") + delta.overall : "—";
                    return (
                      <tr key={a.id} className="border-b border-border/50">
                        <td className="py-2 pr-4">{new Date(a.created_at).toLocaleDateString()}</td>
                        <td className="py-2 pr-4">{a.chapters_audited}</td>
                        <td className="py-2 pr-4">{a.penalties_applied}</td>
                        <td className="py-2 pr-4">{(a.duration_ms / 1000).toFixed(1)}s</td>
                        <td className="py-2 pr-4 font-mono">{deltaStr}</td>
                        <td className="py-2">
                          <Badge variant={a.certification_result ? "default" : "secondary"} className="text-[10px]">
                            {a.certification_result ? "PASS" : "FAIL"}
                          </Badge>
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
    </div>
  );
}
