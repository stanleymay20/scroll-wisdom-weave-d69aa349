/**
 * Phase 2.1a — Reliability operations console.
 * Surfaces webhook health, financial events, export telemetry,
 * chargebacks queue, and alert thresholds.
 */
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RefreshCw, ShieldAlert, Repeat, Activity, AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

type Webhook = {
  stripe_event_id: string; event_type: string; status: string;
  attempts: number; last_error: string | null; received_at: string;
};
type FinEvent = {
  id: string; event_type: string; severity: string; actor: string;
  correlation_id: string | null; purchase_id: string | null;
  stripe_event_id: string | null; created_at: string;
  payload: Record<string, unknown>;
};
type Chargeback = {
  id: string; stripe_dispute_id: string; amount_cents: number;
  reason: string | null; status: string; evidence_due_by: string | null;
  created_at: string;
};
type Threshold = {
  key: string; description: string | null;
  warn_value: number | null; critical_value: number | null;
  window_seconds: number; enabled: boolean;
};

const sevColor = (s: string) =>
  s === "critical" ? "destructive" :
  s === "error" ? "destructive" :
  s === "warn" ? "secondary" : "outline";

export function AdminReliabilityTab() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [events, setEvents] = useState<FinEvent[]>([]);
  const [chargebacks, setChargebacks] = useState<Chargeback[]>([]);
  const [thresholds, setThresholds] = useState<Threshold[]>([]);
  const [exportLatency, setExportLatency] = useState<{ phase: string; avg_ms: number; n: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [reconciling, setReconciling] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [wh, fe, cb, th, tel] = await Promise.all([
      supabase.from("stripe_webhook_events").select("*").order("received_at", { ascending: false }).limit(50),
      supabase.from("financial_events").select("*").order("created_at", { ascending: false }).limit(50),
      supabase.from("chargebacks").select("*").order("created_at", { ascending: false }).limit(20),
      supabase.from("alert_thresholds").select("*").order("key"),
      supabase.from("export_job_telemetry").select("phase, duration_ms").not("duration_ms", "is", null).limit(500),
    ]);
    setWebhooks((wh.data ?? []) as Webhook[]);
    setEvents((fe.data ?? []) as FinEvent[]);
    setChargebacks((cb.data ?? []) as Chargeback[]);
    setThresholds((th.data ?? []) as Threshold[]);

    const byPhase = new Map<string, { sum: number; n: number }>();
    for (const row of (tel.data ?? []) as { phase: string; duration_ms: number }[]) {
      const e = byPhase.get(row.phase) ?? { sum: 0, n: 0 };
      e.sum += row.duration_ms; e.n += 1; byPhase.set(row.phase, e);
    }
    setExportLatency(Array.from(byPhase, ([phase, v]) => ({
      phase, avg_ms: Math.round(v.sum / v.n), n: v.n,
    })).sort((a, b) => b.avg_ms - a.avg_ms));

    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const replay = async (id: string) => {
    try {
      const { error } = await supabase.functions.invoke("admin-webhook-replay", {
        body: { stripe_event_id: id, force: true },
      });
      if (error) throw error;
      toast.success("Webhook replay dispatched");
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Replay failed");
    }
  };

  const reconcile = async () => {
    setReconciling(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-ledger-reconcile");
      if (error) throw error;
      toast.success(`Scanned ${data?.scanned ?? 0} · ${data?.discrepancies ?? 0} discrepancies · ${data?.healed ?? 0} healed`);
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Reconcile failed");
    } finally {
      setReconciling(false);
    }
  };

  const webhookSummary = webhooks.reduce<Record<string, number>>((acc, w) => {
    acc[w.status] = (acc[w.status] ?? 0) + 1; return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Reliability</h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />Refresh
          </Button>
          <Button size="sm" onClick={reconcile} disabled={reconciling}>
            <ShieldAlert className="h-4 w-4 mr-2" />
            {reconciling ? "Reconciling…" : "Run ledger reconcile"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(["processed", "failed", "processing", "dead_lettered"] as const).map((k) => (
          <Card key={k}>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground capitalize">{k.replace("_", " ")}</div>
              <div className="text-2xl font-semibold">{webhookSummary[k] ?? 0}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" />Stripe webhook events (last 50)</CardTitle></CardHeader>
        <CardContent>
          <ScrollArea className="h-72 pr-4">
            <div className="space-y-2">
              {webhooks.map((w) => (
                <div key={w.stripe_event_id} className="rounded-md border border-border p-3 flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={w.status === "processed" || w.status === "replayed" ? "default" : w.status === "failed" || w.status === "dead_lettered" ? "destructive" : "secondary"}>{w.status}</Badge>
                      <span className="font-mono text-xs">{w.event_type}</span>
                      {w.attempts > 1 && <Badge variant="outline" className="text-xs">{w.attempts} attempts</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono mt-1 truncate">{w.stripe_event_id}</div>
                    {w.last_error && <div className="text-xs text-destructive mt-1 truncate">{w.last_error}</div>}
                  </div>
                  <div className="text-xs text-muted-foreground text-right shrink-0">
                    {formatDistanceToNow(new Date(w.received_at), { addSuffix: true })}
                    <Button size="sm" variant="ghost" className="ml-2 h-7 px-2" onClick={() => replay(w.stripe_event_id)}>
                      <Repeat className="h-3 w-3 mr-1" />Replay
                    </Button>
                  </div>
                </div>
              ))}
              {webhooks.length === 0 && <div className="text-sm text-muted-foreground text-center py-8">No webhook events yet.</div>}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Financial events (last 50)</CardTitle></CardHeader>
          <CardContent>
            <ScrollArea className="h-80 pr-4">
              <div className="space-y-2">
                {events.map((e) => (
                  <div key={e.id} className="rounded-md border border-border p-2 text-xs">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={sevColor(e.severity)}>{e.severity}</Badge>
                      <span className="font-mono">{e.event_type}</span>
                      <span className="text-muted-foreground">· {e.actor}</span>
                      <span className="text-muted-foreground ml-auto">{formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}</span>
                    </div>
                    {e.correlation_id && <div className="font-mono text-muted-foreground mt-1 truncate">corr: {e.correlation_id}</div>}
                  </div>
                ))}
                {events.length === 0 && <div className="text-sm text-muted-foreground text-center py-8">No events yet.</div>}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Export latency (avg per phase)</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {exportLatency.map((p) => (
                <div key={p.phase} className="flex items-center justify-between text-sm border-b border-border/40 pb-1">
                  <span className="font-mono">{p.phase}</span>
                  <span className="text-muted-foreground">{p.avg_ms} ms · n={p.n}</span>
                </div>
              ))}
              {exportLatency.length === 0 && <div className="text-sm text-muted-foreground text-center py-8">No telemetry yet.</div>}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4" />Chargebacks</CardTitle></CardHeader>
        <CardContent>
          {chargebacks.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">No chargebacks. ✨</div>
          ) : (
            <div className="space-y-2">
              {chargebacks.map((c) => (
                <div key={c.id} className="rounded-md border border-border p-3 text-sm">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="destructive">{c.status}</Badge>
                    <span>${(c.amount_cents / 100).toFixed(2)}</span>
                    {c.reason && <span className="text-muted-foreground">· {c.reason}</span>}
                    {c.evidence_due_by && (
                      <span className="ml-auto text-xs text-muted-foreground">
                        evidence due {formatDistanceToNow(new Date(c.evidence_due_by), { addSuffix: true })}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono mt-1">{c.stripe_dispute_id}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Alert thresholds</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {thresholds.map((t) => (
              <div key={t.key} className="grid grid-cols-12 gap-2 items-center text-sm border-b border-border/40 pb-1">
                <div className="col-span-5 font-mono text-xs">{t.key}</div>
                <div className="col-span-4 text-xs text-muted-foreground truncate">{t.description}</div>
                <div className="col-span-2 text-xs">warn ≥ {t.warn_value} · crit ≥ {t.critical_value}</div>
                <div className="col-span-1 text-right"><Badge variant={t.enabled ? "default" : "outline"}>{t.enabled ? "on" : "off"}</Badge></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
