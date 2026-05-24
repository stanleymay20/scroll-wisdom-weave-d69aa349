/**
 * AdminOps — unified enterprise operations console
 * Tabs: Overview · Audit Log · Generation Jobs · Organizations
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { AuditLogViewer } from "@/components/admin/AuditLogViewer";
import { AdminFinanceTab } from "@/components/admin/AdminFinanceTab";
import { AdminReliabilityTab } from "@/components/admin/AdminReliabilityTab";
import { AdminRiskTab } from "@/components/admin/AdminRiskTab";
import { AdminRecommendationsTab } from "@/components/admin/AdminRecommendationsTab";
import { Activity, Users, Building2, FileClock, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface JobRow {
  id: string;
  status: string;
  current_chapter: number;
  total_chapters: number;
  error_code: string | null;
  user_id: string;
  book_id: string | null;
  started_at: string;
  completed_at: string | null;
}

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  plan: string;
  created_at: string;
}

function StatCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: any }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="rounded-md bg-primary/10 p-2">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <div className="text-2xl font-semibold">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

interface AdminMetrics {
  total_users?: number;
  active_subscribers?: number;
  free_users?: number;
  trial_users?: number;
  active_7d?: number;
  active_30d?: number;
}

export default function AdminOps() {
  const [stats, setStats] = useState({ users: 0, orgs: 0, activeJobs: 0, auditEvents24h: 0 });
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [
      { data: orgData, count: orgCount },
      { data: jobData },
      { count: auditCount },
      metricsRes,
    ] = await Promise.all([
      supabase
        .from("organizations")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("generation_jobs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(25),
      supabase.from("audit_log").select("*", { count: "exact", head: true }).gte("created_at", since),
      supabase.functions.invoke("admin-metrics"),
    ]);

    const adminMetrics = (metricsRes?.data && typeof metricsRes.data === "object")
      ? (metricsRes.data as AdminMetrics)
      : null;
    setMetrics(adminMetrics);

    const activeJobs = (jobData || []).filter((j) => j.status === "running" || j.status === "pending").length;
    setStats({
      users: adminMetrics?.total_users ?? 0,
      orgs: orgCount ?? 0,
      activeJobs,
      auditEvents24h: auditCount ?? 0,
    });
    setOrgs((orgData as OrgRow[]) || []);
    setJobs((jobData as JobRow[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    document.title = "Admin Ops Console — ScrollLibrary";
    load();
  }, []);

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin Ops Console</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Enterprise oversight: audit, jobs, organizations.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)
        ) : (
          <>
            <StatCard label="Total users" value={stats.users} icon={Users} />
            <StatCard label="Organizations" value={stats.orgs} icon={Building2} />
            <StatCard label="Active jobs" value={stats.activeJobs} icon={Activity} />
            <StatCard label="Audit events (24h)" value={stats.auditEvents24h} icon={FileClock} />
          </>
        )}
      </div>

      {/* User breakdown - sourced authoritatively via SECURITY DEFINER RPC */}
      {metrics && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">User breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
              <div className="rounded-md bg-muted/40 p-3">
                <div className="text-xs text-muted-foreground">Active subscribers</div>
                <div className="text-xl font-semibold">{metrics.active_subscribers ?? 0}</div>
              </div>
              <div className="rounded-md bg-muted/40 p-3">
                <div className="text-xs text-muted-foreground">Trial</div>
                <div className="text-xl font-semibold">{metrics.trial_users ?? 0}</div>
              </div>
              <div className="rounded-md bg-muted/40 p-3">
                <div className="text-xs text-muted-foreground">Free</div>
                <div className="text-xl font-semibold">{metrics.free_users ?? 0}</div>
              </div>
              <div className="rounded-md bg-muted/40 p-3">
                <div className="text-xs text-muted-foreground">Active 7d</div>
                <div className="text-xl font-semibold">{metrics.active_7d ?? 0}</div>
              </div>
              <div className="rounded-md bg-muted/40 p-3">
                <div className="text-xs text-muted-foreground">Active 30d</div>
                <div className="text-xl font-semibold">{metrics.active_30d ?? 0}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="reliability" className="space-y-4">
        <TabsList>
          <TabsTrigger value="reliability">Reliability</TabsTrigger>
          <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
          <TabsTrigger value="audit">Audit Log</TabsTrigger>
          <TabsTrigger value="jobs">Generation Jobs</TabsTrigger>
          <TabsTrigger value="orgs">Organizations</TabsTrigger>
          <TabsTrigger value="finance">Finance</TabsTrigger>
          <TabsTrigger value="risk">Risk</TabsTrigger>
        </TabsList>

        <TabsContent value="reliability">
          <AdminReliabilityTab />
        </TabsContent>

        <TabsContent value="recommendations">
          <AdminRecommendationsTab />
        </TabsContent>

        <TabsContent value="audit">
          <AuditLogViewer limit={150} />
        </TabsContent>

        <TabsContent value="finance">
          <AdminFinanceTab />
        </TabsContent>

        <TabsContent value="risk">
          <AdminRiskTab />
        </TabsContent>





        <TabsContent value="jobs">
          <Card>
            <CardHeader>
              <CardTitle>Recent generation jobs</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px] pr-4">
                {jobs.length === 0 ? (
                  <div className="text-center text-sm text-muted-foreground py-12">No jobs yet.</div>
                ) : (
                  <div className="space-y-2">
                    {jobs.map((j) => (
                      <div key={j.id} className="rounded-md border border-border p-3 flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge
                              variant={
                                j.status === "completed"
                                  ? "default"
                                  : j.status === "failed"
                                  ? "destructive"
                                  : "secondary"
                              }
                            >
                              {j.status}
                            </Badge>
                            <span className="text-sm">
                              Chapter {j.current_chapter}/{j.total_chapters}
                            </span>
                            {j.error_code && (
                              <Badge variant="outline" className="text-xs">
                                {j.error_code}
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1 font-mono">
                            user {j.user_id.slice(0, 8)}…
                            {j.book_id ? ` · book ${j.book_id.slice(0, 8)}…` : ""}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground text-right shrink-0">
                          {formatDistanceToNow(new Date(j.started_at), { addSuffix: true })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orgs">
          <Card>
            <CardHeader>
              <CardTitle>Organizations</CardTitle>
            </CardHeader>
            <CardContent>
              {orgs.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-12">
                  No organizations yet. Users can create one from their settings.
                </div>
              ) : (
                <div className="space-y-2">
                  {orgs.map((o) => (
                    <div key={o.id} className="rounded-md border border-border p-3 flex items-center justify-between">
                      <div>
                        <div className="font-medium">{o.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">@{o.slug}</div>
                      </div>
                      <Badge variant="secondary">{o.plan}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
