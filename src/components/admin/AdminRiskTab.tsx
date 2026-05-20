/**
 * Phase 2.1c.2 — Admin Risk Tab
 * Shows high/blocked users, computed scores + reasons, manual override controls.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Shield, AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface RiskRow {
  user_id: string;
  score: number;
  tier: "low" | "medium" | "high" | "blocked";
  manual_override_tier: string | null;
  reasons: Array<{ code: string; weight: number; detail?: string }>;
  last_evaluated_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
}

function tierBadge(tier: string) {
  const map: Record<string, string> = {
    blocked: "destructive",
    high: "destructive",
    medium: "secondary",
    low: "default",
  };
  return <Badge variant={(map[tier] ?? "default") as any}>{tier}</Badge>;
}

export function AdminRiskTab() {
  const [rows, setRows] = useState<RiskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [evalUser, setEvalUser] = useState("");
  const [overrideTier, setOverrideTier] = useState<Record<string, string>>({});
  const [overrideNotes, setOverrideNotes] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("user_risk_scores")
      .select("*")
      .in("tier", ["high", "blocked"])
      .order("score", { ascending: false })
      .limit(100);
    setRows((data as any) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const reEvaluate = async (userId?: string) => {
    const target = userId ?? evalUser.trim();
    if (!target) return toast.error("Enter a user_id");
    const { error } = await supabase.functions.invoke("evaluate-user-risk", {
      body: { user_id: target, source: "admin_ui" },
    });
    if (error) return toast.error(error.message);
    toast.success("Re-scored");
    load();
  };

  const applyOverride = async (userId: string) => {
    const tier = overrideTier[userId];
    if (!tier) return toast.error("Pick a tier");
    const { error } = await supabase.rpc("admin_set_user_risk_override", {
      _user_id: userId,
      _override_tier: tier === "_clear" ? null : tier,
      _notes: overrideNotes[userId] ?? null,
    });
    if (error) return toast.error(error.message);
    toast.success("Override saved");
    load();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" /> Re-evaluate risk
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-2">
          <Input
            value={evalUser}
            onChange={(e) => setEvalUser(e.target.value)}
            placeholder="user_id (uuid)"
            className="text-foreground caret-foreground"
          />
          <Button onClick={() => reEvaluate()}>Run</Button>
          <Button
            variant="outline"
            onClick={async () => {
              const { error } = await supabase.functions.invoke("evaluate-user-risk", { body: {} });
              if (error) toast.error(error.message);
              else { toast.success("Batch re-score complete"); load(); }
            }}
          >
            <RefreshCw className="h-4 w-4 mr-2" /> Batch (24h active)
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> High / blocked users
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[560px] pr-3">
            {rows.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-12">
                No high or blocked users.
              </div>
            ) : (
              <div className="space-y-3">
                {rows.map((r) => (
                  <div key={r.user_id} className="rounded-md border border-border p-3 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <code className="text-xs">{r.user_id.slice(0, 8)}…</code>
                      {tierBadge(r.manual_override_tier ?? r.tier)}
                      {r.manual_override_tier && (
                        <Badge variant="outline" className="text-xs">override</Badge>
                      )}
                      <span className="text-xs text-muted-foreground">score {r.score}</span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        evaluated {formatDistanceToNow(new Date(r.last_evaluated_at), { addSuffix: true })}
                      </span>
                    </div>

                    {Array.isArray(r.reasons) && r.reasons.length > 0 && (
                      <ul className="text-xs space-y-0.5 text-muted-foreground">
                        {r.reasons.map((rs, i) => (
                          <li key={i}>
                            <span className="font-mono">{rs.code}</span> · +{rs.weight}
                            {rs.detail ? ` — ${rs.detail}` : ""}
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className="flex flex-col sm:flex-row gap-2 pt-1">
                      <Select
                        value={overrideTier[r.user_id] ?? ""}
                        onValueChange={(v) => setOverrideTier((p) => ({ ...p, [r.user_id]: v }))}
                      >
                        <SelectTrigger className="w-full sm:w-40">
                          <SelectValue placeholder="Override tier" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">low</SelectItem>
                          <SelectItem value="medium">medium</SelectItem>
                          <SelectItem value="high">high</SelectItem>
                          <SelectItem value="blocked">blocked</SelectItem>
                          <SelectItem value="_clear">Clear override</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        placeholder="Review notes"
                        value={overrideNotes[r.user_id] ?? ""}
                        onChange={(e) => setOverrideNotes((p) => ({ ...p, [r.user_id]: e.target.value }))}
                        className="text-foreground caret-foreground"
                      />
                      <Button size="sm" onClick={() => applyOverride(r.user_id)}>Save</Button>
                      <Button size="sm" variant="outline" onClick={() => reEvaluate(r.user_id)}>Re-score</Button>
                    </div>

                    {r.review_notes && (
                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium">Notes:</span> {r.review_notes}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
