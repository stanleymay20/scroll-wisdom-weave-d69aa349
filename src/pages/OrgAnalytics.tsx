/**
 * OrgAnalytics — per-organization cohort dashboard.
 * Shows membership, books, mastery distribution, and recent activity for the active org.
 * Org admins/owners only.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOrganization } from "@/hooks/useOrganization";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, Users, BookOpen, Award, Activity, ArrowLeft, TrendingUp } from "lucide-react";
import { logAudit } from "@/lib/auditLog";

interface OrgStats {
  memberCount: number;
  bookCount: number;
  publishedCount: number;
  certificateCount: number;
  recentBooks: { id: string; title: string; created_at: string }[];
}

export default function OrgAnalytics() {
  const navigate = useNavigate();
  const { activeOrg, activeOrgId, isOrgAdmin, isLoading: orgLoading } = useOrganization();
  const [stats, setStats] = useState<OrgStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = activeOrg
      ? `${activeOrg.name} analytics — ScrollLibrary`
      : "Organization analytics — ScrollLibrary";
  }, [activeOrg]);

  useEffect(() => {
    if (!activeOrgId) {
      setStats(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ count: memberCount }, booksRes, { count: certCount }] = await Promise.all([
        supabase
          .from("organization_members")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", activeOrgId),
        supabase
          .from("books")
          .select("id, title, created_at, is_published")
          .eq("organization_id", activeOrgId)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("audit_log")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", activeOrgId)
          .eq("event_type", "certificate.issued"),
      ]);

      if (cancelled) return;

      const books = booksRes.data || [];
      setStats({
        memberCount: memberCount ?? 0,
        bookCount: books.length,
        publishedCount: books.filter((b) => b.is_published).length,
        certificateCount: certCount ?? 0,
        recentBooks: books.slice(0, 5).map((b) => ({
          id: b.id,
          title: b.title,
          created_at: b.created_at,
        })),
      });
      setLoading(false);

      // Audit the analytics view
      logAudit({
        eventType: "org.analytics.viewed",
        organizationId: activeOrgId,
        resourceType: "organization",
        resourceId: activeOrgId,
      }).catch(() => {});
    })();

    return () => {
      cancelled = true;
    };
  }, [activeOrgId]);

  const cards = useMemo(() => {
    if (!stats) return [];
    return [
      { icon: Users, label: "Members", value: stats.memberCount },
      { icon: BookOpen, label: "Books", value: stats.bookCount },
      { icon: TrendingUp, label: "Published", value: stats.publishedCount },
      { icon: Award, label: "Certificates issued", value: stats.certificateCount },
    ];
  }, [stats]);

  if (orgLoading) {
    return (
      <div className="container mx-auto py-8 px-4">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!activeOrgId || !activeOrg) {
    return (
      <div className="container mx-auto py-12 px-4 max-w-2xl text-center">
        <Building2 className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
        <h1 className="text-2xl font-bold mb-2">No active organization</h1>
        <p className="text-muted-foreground mb-4">
          Switch to or create an organization to see cohort analytics.
        </p>
        <Button onClick={() => navigate("/organizations")}>Manage organizations</Button>
      </div>
    );
  }

  if (!isOrgAdmin) {
    return (
      <div className="container mx-auto py-12 px-4 max-w-2xl text-center">
        <Activity className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
        <h1 className="text-2xl font-bold mb-2">Admins only</h1>
        <p className="text-muted-foreground mb-4">
          Organization analytics are visible to owners and admins of {activeOrg.name}.
        </p>
        <Button variant="outline" onClick={() => navigate("/organizations")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to organizations
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl">
      <div className="flex items-start justify-between mb-6 gap-4">
        <div className="min-w-0">
          <Button variant="ghost" size="sm" className="mb-2 -ml-3" onClick={() => navigate("/organizations")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Organizations
          </Button>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Building2 className="h-7 w-7 text-primary" />
            {activeOrg.name}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cohort overview — membership, content, and credentials.
          </p>
        </div>
        <Badge variant="secondary" className="capitalize">
          {activeOrg.plan} plan
        </Badge>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading analytics…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {cards.map(({ icon: Icon, label, value }) => (
              <Card key={label}>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Icon className="h-4 w-4" />
                    <span className="text-xs uppercase tracking-wide">{label}</span>
                  </div>
                  <p className="text-3xl font-bold">{value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Recent books</CardTitle>
              <CardDescription>Latest books created within {activeOrg.name}.</CardDescription>
            </CardHeader>
            <CardContent>
              {stats?.recentBooks.length ? (
                <ul className="divide-y">
                  {stats.recentBooks.map((b) => (
                    <li key={b.id} className="py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{b.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(b.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => navigate(`/book/${b.id}`)}>
                        View
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  No books yet. Books created while this org is active will appear here.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
