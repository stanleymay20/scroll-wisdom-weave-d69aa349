/**
 * AuditLogViewer — paginated, filterable audit trail for admins
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, RefreshCw, Shield } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface AuditEvent {
  id: string;
  event_type: string;
  actor_id: string | null;
  organization_id: string | null;
  resource_type: string | null;
  resource_id: string | null;
  severity: "info" | "warn" | "error" | "critical";
  metadata: Record<string, unknown>;
  created_at: string;
}

const severityVariant: Record<AuditEvent["severity"], "default" | "secondary" | "destructive" | "outline"> = {
  info: "secondary",
  warn: "outline",
  error: "destructive",
  critical: "destructive",
};

interface AuditLogViewerProps {
  organizationId?: string | null;
  limit?: number;
}

export function AuditLogViewer({ organizationId, limit = 100 }: AuditLogViewerProps) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from("audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (organizationId) q = q.eq("organization_id", organizationId);
    const { data, error } = await q;
    if (!error && data) setEvents(data as AuditEvent[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, limit]);

  const filtered = events.filter((e) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      e.event_type.toLowerCase().includes(s) ||
      e.resource_type?.toLowerCase().includes(s) ||
      e.resource_id?.toLowerCase().includes(s) ||
      JSON.stringify(e.metadata).toLowerCase().includes(s)
    );
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Audit Log
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <div className="relative mt-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Filter by event, resource, or metadata…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px] pr-4">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-12">
              No audit events {search ? "match your filter" : "yet"}.
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((e) => (
                <div
                  key={e.id}
                  className="flex items-start justify-between gap-3 rounded-md border border-border p-3 hover:bg-muted/40 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={severityVariant[e.severity]} className="text-xs">
                        {e.severity}
                      </Badge>
                      <span className="font-mono text-sm font-medium text-foreground">
                        {e.event_type}
                      </span>
                      {e.resource_type && (
                        <span className="text-xs text-muted-foreground">
                          on {e.resource_type}
                          {e.resource_id ? ` · ${e.resource_id.slice(0, 8)}…` : ""}
                        </span>
                      )}
                    </div>
                    {Object.keys(e.metadata || {}).length > 0 && (
                      <pre className="mt-1 text-xs text-muted-foreground bg-muted/50 rounded p-2 overflow-x-auto">
                        {JSON.stringify(e.metadata, null, 2)}
                      </pre>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                    </div>
                    {e.actor_id && (
                      <div className="text-[10px] font-mono text-muted-foreground mt-1">
                        {e.actor_id.slice(0, 8)}…
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
