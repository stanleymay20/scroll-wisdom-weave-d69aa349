/**
 * PublishabilityQAPanel
 * ---------------------
 * Runs `qa-publishability-audit` on demand and renders the latest report:
 *   - Overall status pill (Ready / Needs review / Blocked) + score
 *   - Category counters
 *   - Issue list grouped by chapter
 *
 * The report is persisted server-side in `book_qa_reports`; on mount we load
 * the most recent one, and the "Run audit" button appends a new snapshot.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, AlertTriangle, XCircle, Loader2, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

type QASeverity = "blocker" | "warning" | "info";
type QAStatus = "ready" | "needs_review" | "blocked";
type QACategory = "content" | "structure" | "rendering" | "citations" | "export";

interface QAIssue {
  severity: QASeverity;
  code: string;
  message: string;
  chapter?: number;
  hint?: string;
  category: QACategory;
}

interface QAReportRow {
  id: string;
  score: number;
  status: QAStatus;
  blocker_count: number;
  warning_count: number;
  info_count: number;
  totals: { chapters?: number; words?: number; images?: number; tables?: number; codeBlocks?: number };
  issues: QAIssue[];
  created_at: string;
}

const STATUS_META: Record<QAStatus, { label: string; icon: typeof CheckCircle2; className: string }> = {
  ready:        { label: "Ready to publish", icon: CheckCircle2, className: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30" },
  needs_review: { label: "Needs review",     icon: AlertTriangle, className: "bg-amber-500/15 text-amber-700 border-amber-500/30" },
  blocked:      { label: "Blocked",          icon: XCircle,       className: "bg-red-500/15 text-red-700 border-red-500/30" },
};

const CATEGORY_LABEL: Record<QACategory, string> = {
  content: "Content artifacts",
  structure: "Structure",
  rendering: "Rendering",
  citations: "Citations",
  export: "Export",
};

const SEVERITY_ORDER: Record<QASeverity, number> = { blocker: 0, warning: 1, info: 2 };

interface Props {
  bookId: string;
}

export default function PublishabilityQAPanel({ bookId }: Props) {
  const { toast } = useToast();
  const [report, setReport] = useState<QAReportRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const loadLatest = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("book_qa_reports")
      .select("*")
      .eq("book_id", bookId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setReport((data as unknown as QAReportRow) ?? null);
    setLoading(false);
  };

  useEffect(() => { loadLatest(); }, [bookId]);

  const runAudit = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("qa-publishability-audit", {
        body: { bookId },
      });
      if (error) throw error;
      toast({
        title: "QA audit complete",
        description: `${data.report.status.replace("_", " ")} — score ${data.report.score}`,
      });
      await loadLatest();
    } catch (e) {
      toast({
        title: "QA audit failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setRunning(false);
    }
  };

  const grouped: Array<[number | "book", QAIssue[]]> = (() => {
    if (!report) return [];
    const map = new Map<number | "book", QAIssue[]>();
    const sorted = [...report.issues].sort((a, b) => {
      const ca = a.chapter ?? -1, cb = b.chapter ?? -1;
      if (ca !== cb) return ca - cb;
      return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    });
    for (const i of sorted) {
      const key = i.chapter ?? "book";
      const arr = map.get(key) ?? [];
      arr.push(i);
      map.set(key, arr);
    }
    return Array.from(map.entries());
  })();

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4" /> Publishability QA
          </div>
          <h3 className="text-lg font-semibold text-foreground mt-1">Static publishability report</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Deterministic checks: AI artifacts, unresolved LaTeX, broken tables, orphan figures,
            heading hierarchy, truncation risk, and citation coverage.
          </p>
        </div>
        <Button onClick={runAudit} disabled={running} size="sm">
          {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
          Run QA audit
        </Button>
      </div>

      {loading ? (
        <Skeleton className="h-32 w-full" />
      ) : !report ? (
        <div className="text-sm text-muted-foreground py-6 text-center">
          No QA report yet. Run the audit to generate one.
        </div>
      ) : (
        <>
          <ReportHeader report={report} />
          <IssueList grouped={grouped} />
        </>
      )}
    </Card>
  );
}

function ReportHeader({ report }: { report: QAReportRow }) {
  const meta = STATUS_META[report.status];
  const Icon = meta.icon;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <Badge variant="outline" className={cn("gap-1.5", meta.className)}>
          <Icon className="h-3.5 w-3.5" />
          {meta.label}
        </Badge>
        <span className="text-sm text-muted-foreground">
          {report.blocker_count} blocker{report.blocker_count === 1 ? "" : "s"} ·{" "}
          {report.warning_count} warning{report.warning_count === 1 ? "" : "s"} ·{" "}
          {report.info_count} info
        </span>
        <span className="text-xs text-muted-foreground ml-auto">
          {new Date(report.created_at).toLocaleString()}
        </span>
      </div>
      <div>
        <div className="flex justify-between text-sm mb-1">
          <span className="text-muted-foreground">Publishability score</span>
          <span className="font-medium text-foreground">{report.score} / 100</span>
        </div>
        <Progress value={report.score} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
        {(["chapters","words","images","tables","codeBlocks"] as const).map((k) => (
          <div key={k} className="rounded-md border border-border/60 px-2 py-1.5">
            <div className="text-muted-foreground capitalize">{k === "codeBlocks" ? "code blocks" : k}</div>
            <div className="text-foreground font-medium">{(report.totals?.[k] ?? 0).toLocaleString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function IssueList({ grouped }: { grouped: Array<[number | "book", QAIssue[]]> }) {
  if (grouped.length === 0) {
    return (
      <div className="text-sm text-emerald-700 bg-emerald-500/10 border border-emerald-500/30 rounded-md px-3 py-2">
        No issues detected. This book is ready for export.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {grouped.map(([key, issues]) => (
        <div key={String(key)} className="rounded-md border border-border/60">
          <div className="px-3 py-2 border-b border-border/60 text-sm font-medium text-foreground">
            {key === "book" ? "Whole book" : `Chapter ${key}`}
            <span className="text-muted-foreground font-normal ml-2">
              ({issues.length} issue{issues.length === 1 ? "" : "s"})
            </span>
          </div>
          <ul className="divide-y divide-border/60">
            {issues.map((i, idx) => (
              <li key={idx} className="px-3 py-2 flex items-start gap-2 text-sm">
                <SeverityIcon severity={i.severity} />
                <div className="flex-1 min-w-0">
                  <div className="text-foreground">{i.message}</div>
                  {i.hint && <div className="text-xs text-muted-foreground mt-0.5">{i.hint}</div>}
                </div>
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {CATEGORY_LABEL[i.category] ?? i.category}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function SeverityIcon({ severity }: { severity: QASeverity }) {
  if (severity === "blocker") return <XCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />;
  if (severity === "warning") return <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />;
  return <CheckCircle2 className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />;
}
