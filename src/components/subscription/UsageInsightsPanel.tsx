/**
 * UsageInsightsPanel — Settings → Billing usage card.
 * Reads from the secure get_user_usage_snapshot RPC via useUsageSnapshot.
 * No client-derived limits — the source of truth is server.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, BookOpen, Mic, Sparkles } from "lucide-react";
import { useUsageSnapshot } from "@/hooks/useUsageSnapshot";
import { useNavigate } from "react-router-dom";

interface RowProps {
  icon: typeof BookOpen;
  label: string;
  used: number;
  limit: number | null | undefined;
  unit?: string;
}

function UsageRow({ icon: Icon, label, used, limit, unit }: RowProps) {
  const isUnlimited = limit === null || limit === undefined || limit < 0;
  const pct = isUnlimited ? 0 : Math.min(100, Math.round(((used || 0) / Math.max(1, limit)) * 100));
  const exhausted = !isUnlimited && used >= (limit ?? 0);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          {label}
        </span>
        <span className={`font-mono text-xs ${exhausted ? "text-destructive" : "text-muted-foreground"}`}>
          {used}
          {isUnlimited ? " / ∞" : ` / ${limit}`}
          {unit ? ` ${unit}` : ""}
        </span>
      </div>
      {!isUnlimited && <Progress value={pct} className="h-1.5" />}
    </div>
  );
}

export function UsageInsightsPanel() {
  const { snapshot, loading, error, refresh } = useUsageSnapshot();
  const navigate = useNavigate();

  return (
    <Card className="bg-gradient-card border-border/50">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          This Month's Usage
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <p className="text-xs text-destructive">Couldn't load usage: {error}</p>
        )}
        {!snapshot && !error && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
          </div>
        )}
        {snapshot && (
          <>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Period: {snapshot.month}</span>
              <Badge variant="secondary" className="capitalize">{snapshot.plan}</Badge>
            </div>
            <UsageRow
              icon={BookOpen}
              label="Books generated"
              used={snapshot.booksThisMonth}
              limit={snapshot.booksLimit}
            />
            <UsageRow
              icon={Mic}
              label="Audio listening"
              used={snapshot.ttsMinutesUsed}
              limit={snapshot.ttsMinutesLimit}
              unit="min"
            />
            <div className="flex items-center justify-end pt-2">
              <Button size="sm" variant="outline" onClick={() => navigate("/pricing")}>
                See plan options
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
