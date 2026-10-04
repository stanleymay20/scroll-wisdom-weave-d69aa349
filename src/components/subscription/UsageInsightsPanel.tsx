/**
 * Settings → Billing usage card for the sustainable billing catalogue.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, BookOpen, Mic, Sparkles, Image as ImageIcon, Type } from "lucide-react";
import { useUsageSnapshot } from "@/hooks/useUsageSnapshot";
import { useNavigate } from "react-router-dom";
import { SUBSCRIPTION_TIERS } from "@/lib/subscription";

interface RowProps {
  icon: typeof BookOpen;
  label: string;
  used: number;
  limit: number | null | undefined;
  unit?: string;
  format?: (value: number) => string;
}

function UsageRow({ icon: Icon, label, used, limit, unit, format }: RowProps) {
  const isUnlimited = limit === null || limit === undefined || limit < 0;
  const pct = isUnlimited ? 0 : Math.min(100, Math.round(((used || 0) / Math.max(1, limit)) * 100));
  const exhausted = !isUnlimited && used >= (limit ?? 0);
  const render = format ?? ((value: number) => String(Math.round(value * 100) / 100));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          {label}
        </span>
        <span className={"font-mono text-xs " + (exhausted ? "text-destructive" : "text-muted-foreground")}>
          {render(used)}
          {isUnlimited ? " / ∞" : " / " + render(limit ?? 0)}
          {unit ? " " + unit : ""}
        </span>
      </div>
      {!isUnlimited && <Progress value={pct} className="h-1.5" />}
    </div>
  );
}

const compact = (value: number) =>
  new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);

export function UsageInsightsPanel() {
  const { snapshot, loading, error, refresh } = useUsageSnapshot();
  const navigate = useNavigate();

  return (
    <Card className="bg-gradient-card border-border/50">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          This Month&apos;s Usage
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-xs text-destructive">Couldn&apos;t load usage: {error}</p>}
        {!snapshot && !error && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
          </div>
        )}
        {snapshot && (
          <>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Period: {snapshot.month}</span>
              <Badge variant="secondary">{SUBSCRIPTION_TIERS[snapshot.plan].name}</Badge>
            </div>
            <UsageRow
              icon={BookOpen}
              label="Book projects"
              used={snapshot.booksThisMonth}
              limit={snapshot.booksLimit}
            />
            <UsageRow
              icon={Type}
              label="AI-generated text"
              used={snapshot.aiTextWordsUsed}
              limit={snapshot.aiTextWordsLimit}
              unit="words"
              format={compact}
            />
            <UsageRow
              icon={ImageIcon}
              label="AI-generated visuals"
              used={snapshot.visualCreditsUsed}
              limit={snapshot.visualCreditsLimit}
              unit="requests"
            />
            <UsageRow
              icon={Mic}
              label="Audio allowance"
              used={snapshot.audioCreditsUsed}
              limit={snapshot.audioCreditsLimit}
              unit="narration-min eq."
            />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              One audio allowance unit equals about one standard narration minute. Interactive voice, when enabled, consumes the same pool at a higher weighted rate.
            </p>
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
