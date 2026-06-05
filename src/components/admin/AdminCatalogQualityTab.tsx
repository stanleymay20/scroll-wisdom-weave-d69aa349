/**
 * AdminCatalogQualityTab — marketplace-wide Elite Readiness sweep.
 *
 * Calls the admin RPC `get_marketplace_elite_readiness` which scores every
 * published listing on the fly using the SAME scorer the author panel uses.
 * No duplicate logic, no cached counters — single source of truth.
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, ExternalLink } from "lucide-react";

type Tier = "elite" | "ready" | "needs_work" | "draft";

interface Row {
  book_id: string;
  title: string;
  author_user_id: string;
  listing_slug: string;
  tier: Tier;
  composite: number;
  hard_blocker_count: number;
  dimensions: Record<string, { score: number; passed: number; total: number }>;
}

const TIER_TONE: Record<Tier, string> = {
  elite: "bg-primary/10 text-primary border-primary/30",
  ready: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  needs_work: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  draft: "bg-muted text-muted-foreground",
};

const PAGE_SIZE = 50;

export function AdminCatalogQualityTab() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [tierFilter, setTierFilter] = useState<Tier | "all">("all");
  const [offset, setOffset] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_marketplace_elite_readiness" as never, {
      _limit: PAGE_SIZE,
      _offset: offset,
      _tier: tierFilter === "all" ? null : tierFilter,
    } as never);
    if (error) {
      setRows([]);
    } else {
      setRows((data ?? []) as Row[]);
    }
    setLoading(false);
  }, [offset, tierFilter]);

  useEffect(() => { void load(); }, [load]);

  const counts = (rows ?? []).reduce<Record<string, number>>((acc, r) => {
    acc[r.tier] = (acc[r.tier] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold">Catalog Quality</h3>
          <p className="text-xs text-muted-foreground">
            Live Elite Readiness for every public listing — same scorer authors see on their book.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={tierFilter} onValueChange={(v) => { setOffset(0); setTierFilter(v as Tier | "all"); }}>
            <SelectTrigger className="w-[160px] text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tiers</SelectItem>
              <SelectItem value="elite">Elite only</SelectItem>
              <SelectItem value="ready">Ready</SelectItem>
              <SelectItem value="needs_work">Needs work</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
        {(["elite", "ready", "needs_work", "draft"] as Tier[]).map((t) => (
          <Badge key={t} variant="outline" className={TIER_TONE[t]}>
            {t}: {counts[t] ?? 0}
          </Badge>
        ))}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th className="text-left py-2 px-2 font-medium">Book</th>
              <th className="text-left py-2 px-2 font-medium">Tier</th>
              <th className="text-right py-2 px-2 font-medium">Score</th>
              <th className="text-right py-2 px-2 font-medium">Pre</th>
              <th className="text-right py-2 px-2 font-medium">Read</th>
              <th className="text-right py-2 px-2 font-medium">Exp</th>
              <th className="text-right py-2 px-2 font-medium">Cat</th>
              <th className="text-right py-2 px-2 font-medium">Disc</th>
              <th className="text-right py-2 px-2 font-medium">Blockers</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows === null && Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="border-b border-border/50">
                <td colSpan={10} className="py-2"><Skeleton className="h-6 w-full" /></td>
              </tr>
            ))}
            {rows && rows.length === 0 && (
              <tr><td colSpan={10} className="py-6 text-center text-muted-foreground text-sm">No listings match this filter.</td></tr>
            )}
            {rows && rows.map((r) => {
              const d = r.dimensions ?? {};
              const pct = (k: string) => Math.round(((d[k]?.score ?? 0) as number) * 100);
              return (
                <tr key={r.book_id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-2 px-2 max-w-[260px] truncate text-foreground">{r.title}</td>
                  <td className="py-2 px-2"><Badge variant="outline" className={TIER_TONE[r.tier]}>{r.tier}</Badge></td>
                  <td className="py-2 px-2 text-right tabular-nums font-medium">{Math.round((r.composite ?? 0) * 100)}</td>
                  <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">{pct("preflight")}</td>
                  <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">{pct("reading")}</td>
                  <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">{pct("export")}</td>
                  <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">{pct("catalog")}</td>
                  <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">{pct("discoverability")}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{r.hard_blocker_count}</td>
                  <td className="py-2 px-2 text-right">
                    <Link to={`/book/${r.book_id}/publishing`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                      Open <ExternalLink className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex justify-between items-center text-xs text-muted-foreground">
        <span>Page offset {offset}</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} disabled={offset === 0 || loading}>Previous</Button>
          <Button size="sm" variant="outline" onClick={() => setOffset(offset + PAGE_SIZE)} disabled={loading || (rows?.length ?? 0) < PAGE_SIZE}>Next</Button>
        </div>
      </div>
    </Card>
  );
}
