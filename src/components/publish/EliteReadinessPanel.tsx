/**
 * EliteReadinessPanel — single-source author audit for "Elite" marketplace tier.
 *
 * Score comes from the SECURITY DEFINER RPC `get_book_elite_readiness` —
 * never recomputed client-side. Tiers map to verdicts users can act on:
 *   draft        — required publishing fields missing
 *   needs_work   — publish allowed, composite < 0.65
 *   ready        — publish allowed, composite >= 0.65
 *   elite        — premium tier, composite >= 0.85 AND all hard blockers cleared
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Award, CheckCircle2, AlertTriangle, RefreshCw, BookOpen, Search, FileDown, Library, Sparkles } from "lucide-react";

interface Dim {
  score: number;
  passed: number;
  total: number;
  [k: string]: unknown;
}

interface Readiness {
  book_id: string;
  tier: "draft" | "needs_work" | "ready" | "elite";
  composite: number;
  dimensions: {
    preflight: Dim;
    reading: Dim & { graph_nodes?: number; required_nodes?: number; total_words?: number; audit_score?: number | null };
    export: Dim & { bundles_ready?: string[]; bundles_missing?: string[]; completed_30d?: number };
    catalog: Dim & { open_reports?: number; open_citation_flags?: number; review_count?: number; rating_avg?: number | null };
    discoverability: Dim;
  };
  hard_blockers: string[];
  publish_blockers: string[];
  computed_at: string;
}

const TIER_META: Record<Readiness["tier"], { label: string; tone: string; desc: string }> = {
  draft: { label: "Draft", tone: "bg-muted text-muted-foreground", desc: "Required publishing fields missing." },
  needs_work: { label: "Needs work", tone: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30", desc: "You can publish — but quality is below the marketplace bar." },
  ready: { label: "Ready", tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30", desc: "Publishable and good. Push the remaining items to reach Elite." },
  elite: { label: "Elite", tone: "bg-primary/10 text-primary border-primary/30", desc: "Premium marketplace quality." },
};

const BLOCKER_LABELS: Record<string, string> = {
  cover_missing: "Add a custom cover image",
  subtitle_missing: "Add a subtitle to your listing",
  blurb_too_short: "Write a blurb of at least 120 characters",
  amazon_description_too_short: "Write an Amazon description of at least 200 characters",
  sample_chapters_below_3: "Offer at least 3 sample chapters",
  price_missing: "Set a price for this paid listing",
  chapters_incomplete: "Fill every chapter (≥200 chars) and have at least 5 chapters",
  chapters_unaudited: "Run the chapter audit on every chapter",
  book_audit_below_threshold: "Improve content quality — book audit score below 0.85",
  certification_not_eligible: "Resolve audit blockers — book is not certification-eligible",
  knowledge_graph_too_sparse: "Generate more concepts so the knowledge graph matches book length",
  no_recent_export: "Generate at least one export bundle in the last 30 days",
  open_content_reports: "Resolve open content reports on this book",
  open_citation_flags: "Resolve open citation flags",
  seo_keywords_below_3: "Add at least 3 SEO keywords",
  category_default: "Pick a real category (not 'general')",
  author_profile_incomplete: "Complete your author profile (display name + bio)",
};

const DIM_ICONS = {
  preflight: BookOpen,
  reading: Sparkles,
  export: FileDown,
  catalog: Library,
  discoverability: Search,
} as const;

const DIM_LABELS = {
  preflight: "Pre-flight",
  reading: "Reading experience",
  export: "Export fidelity",
  catalog: "Catalog health",
  discoverability: "Discoverability",
} as const;

const DIM_WEIGHT = { preflight: 30, reading: 30, export: 15, catalog: 15, discoverability: 10 } as const;

interface Props {
  bookId: string;
}

export function EliteReadinessPanel({ bookId }: Props) {
  const [data, setData] = useState<Readiness | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: row, error } = await supabase.rpc("get_book_elite_readiness" as never, { _book_id: bookId } as never);
    if (!error && row && typeof row === "object" && !(row as { error?: string }).error) {
      setData(row as unknown as Readiness);
    }
    setLoading(false);
  }, [bookId]);

  useEffect(() => { void load(); }, [load]);

  if (loading && !data) {
    return (
      <Card className="p-6 mb-6">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-3 w-full mt-4" />
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-5 gap-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      </Card>
    );
  }
  if (!data) return null;

  const tier = TIER_META[data.tier];
  const composite = Math.round(data.composite * 100);
  const blockers = [...(data.publish_blockers ?? []), ...(data.hard_blockers ?? [])];
  const uniqueBlockers = Array.from(new Set(blockers));

  return (
    <Card className="p-6 mb-6 border-border">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Award className="h-5 w-5 text-foreground/80" />
            <h2 className="text-lg font-semibold">Elite Readiness</h2>
            <Badge variant="outline" className={tier.tone}>{tier.label}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{tier.desc}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-3xl font-semibold tabular-nums">{composite}<span className="text-base text-muted-foreground">/100</span></div>
            <div className="text-[11px] text-muted-foreground">composite score</div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <div className="mt-5">
        <Progress value={composite} className="h-2" />
        <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
          <span>Needs work · 0</span>
          <span>Ready · 65</span>
          <span>Elite · 85</span>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-5 gap-3">
        {(Object.keys(DIM_LABELS) as Array<keyof typeof DIM_LABELS>).map((k) => {
          const dim = data.dimensions[k];
          const Icon = DIM_ICONS[k];
          const pct = Math.round((dim?.score ?? 0) * 100);
          return (
            <div key={k} className="rounded-lg border border-border p-3 bg-muted/20">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Icon className="h-3.5 w-3.5" />
                <span>{DIM_LABELS[k]}</span>
                <span className="ml-auto text-[10px] opacity-70">{DIM_WEIGHT[k]}%</span>
              </div>
              <div className="mt-1 text-xl font-semibold tabular-nums text-foreground">{pct}</div>
              <div className="text-[11px] text-muted-foreground">{dim?.passed ?? 0}/{dim?.total ?? 0} checks</div>
            </div>
          );
        })}
      </div>

      {uniqueBlockers.length > 0 ? (
        <div className="mt-6">
          <div className="flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            What's blocking Elite ({uniqueBlockers.length})
          </div>
          <ul className="mt-2 space-y-1.5">
            {uniqueBlockers.map((code) => (
              <li key={code} className="flex items-start gap-2 text-sm text-muted-foreground">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" aria-hidden />
                <span className="text-foreground/90">{BLOCKER_LABELS[code] ?? code}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="mt-6 flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4" />
          All Elite checks cleared. Excellent work.
        </div>
      )}

      {data.dimensions.export.bundles_missing && data.dimensions.export.bundles_missing.length > 0 && data.tier !== "draft" && (
        <p className="mt-4 text-xs text-muted-foreground">
          Export bundles still to generate for full reach:{" "}
          <span className="text-foreground">{data.dimensions.export.bundles_missing.join(", ")}</span>
        </p>
      )}
    </Card>
  );
}
