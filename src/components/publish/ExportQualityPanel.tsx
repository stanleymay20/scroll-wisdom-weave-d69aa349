/**
 * Export Quality Panel
 * Shows a Ready / Needs review / Blocked score, the list of issues, and an
 * "Export Preview" of the first chapter rendered through the same canonical
 * pipeline that drives in-app reading.
 *
 * Used in BookPublishSettings to give creators a trustworthy heads-up
 * before they make a paid listing public.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, AlertTriangle, XCircle, Eye, Sparkles } from "lucide-react";
import { parseBookToCanonical, type CanonicalChapter } from "@/lib/canonicalContent";
import { auditBookForExport, qualityStatusLabel, type ExportQualityReport } from "@/lib/exportQuality";
import { auditBookArtifacts } from "@/lib/contentQuality";
import { trackStorefrontEvent } from "@/lib/storefrontAnalytics";
import { cn } from "@/lib/utils";

interface Props {
  bookId: string;
  listingId?: string | null;
  hasCover: boolean;
  bookType?: string | null;
  /** When status is blocked, the parent should disable paid publishing. */
  onStatusChange?: (report: ExportQualityReport) => void;
}

export function ExportQualityPanel({ bookId, listingId, hasCover, bookType, onStatusChange }: Props) {
  const [canonical, setCanonical] = useState<CanonicalChapter[] | null>(null);
  // Raw chapter rows are kept so we can audit AI artifacts on the original
  // text (the canonical parser strips some of the markers we want to detect).
  const [rawChapters, setRawChapters] = useState<Array<{ chapter_number: number; content: string | null }> | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("chapters")
        .select("chapter_number, title, content")
        .eq("book_id", bookId)
        .order("chapter_number", { ascending: true });
      if (cancel) return;
      setRawChapters((data ?? []).map((c) => ({ chapter_number: c.chapter_number, content: c.content })));
      setCanonical(parseBookToCanonical(data ?? []));
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [bookId]);

  const report = useMemo<ExportQualityReport | null>(() => {
    if (!canonical) return null;
    const base = auditBookForExport(canonical, { hasCover, bookType: bookType ?? null });
    // Fold AI-artifact issues into the report so the creator sees them in
    // one list and the score gates publishing the same way.
    const artifacts = rawChapters ? auditBookArtifacts(rawChapters) : [];
    if (artifacts.length === 0) return base;
    const merged = [...base.issues, ...artifacts];
    const blockers = merged.filter((i) => i.severity === "blocker").length;
    const warnings = merged.filter((i) => i.severity === "warning").length;
    return {
      ...base,
      issues: merged,
      score: Math.max(0, 100 - blockers * 25 - warnings * 5),
      status: blockers > 0 ? "blocked" : warnings > 0 ? "needs_review" : "ready",
    };
  }, [canonical, rawChapters, hasCover, bookType]);

  useEffect(() => {
    if (!report) return;
    onStatusChange?.(report);
    if (report.status === "blocked") {
      void trackStorefrontEvent(listingId ?? null, "export_quality_blocked" as any, { score: report.score });
    } else if (report.status === "needs_review") {
      void trackStorefrontEvent(listingId ?? null, "export_quality_warning" as any, { score: report.score });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report?.status, report?.score]);

  if (loading || !report) {
    return (
      <Card className="p-4 sm:p-6 space-y-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </Card>
    );
  }

  const StatusIcon = report.status === "ready" ? CheckCircle2 : report.status === "needs_review" ? AlertTriangle : XCircle;
  const statusTone =
    report.status === "ready" ? "text-green-500 border-green-500/40 bg-green-500/10"
    : report.status === "needs_review" ? "text-amber-500 border-amber-500/40 bg-amber-500/10"
    : "text-destructive border-destructive/40 bg-destructive/10";

  return (
    <Card className="p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <h2 className="text-lg font-semibold">Export quality</h2>
            <Badge variant="outline" className={cn("border", statusTone)}>
              <StatusIcon className="w-3 h-3 mr-1" />
              {qualityStatusLabel(report.status)} · {report.score}/100
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Your book will be exported using the same structure readers see in the app.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => {
          setPreviewOpen(true);
          void trackStorefrontEvent(listingId ?? null, "export_preview_opened" as any, { book_id: bookId });
        }}>
          <Eye className="w-4 h-4 mr-2" /> Export preview
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
        <Stat label="Chapters" value={report.totals.chapters} />
        <Stat label="Words" value={report.totals.words.toLocaleString()} />
        <Stat label="Images" value={report.totals.images} />
        <Stat label="Tables" value={report.totals.tables} />
        <Stat label="Code blocks" value={report.totals.codeBlocks} />
      </div>

      {report.issues.length > 0 && (
        <ul className="mt-4 space-y-1.5 text-sm">
          {report.issues.slice(0, 8).map((iss, idx) => (
            <li key={idx} className="flex items-start gap-2">
              {iss.severity === "blocker" ? (
                <XCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              )}
              <div className="min-w-0">
                <div className="font-medium">{iss.message}</div>
                {iss.hint && <div className="text-xs text-muted-foreground">{iss.hint}</div>}
              </div>
            </li>
          ))}
          {report.issues.length > 8 && (
            <li className="text-xs text-muted-foreground pl-6">+ {report.issues.length - 8} more — open Export preview to review.</li>
          )}
        </ul>
      )}

      {report.status === "blocked" && (
        <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          Paid publishing is paused until blockers are resolved.
        </div>
      )}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Export preview — first chapter</DialogTitle>
          </DialogHeader>
          <PreviewBody canonical={canonical ?? []} report={report} />
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <div className="text-muted-foreground">{label}</div>
      <div className="font-semibold text-foreground">{value}</div>
    </div>
  );
}

function PreviewBody({ canonical, report }: { canonical: CanonicalChapter[]; report: ExportQualityReport }) {
  const first = canonical[0];
  if (!first) return <div className="text-sm text-muted-foreground">No chapters to preview.</div>;
  return (
    <div className="space-y-4">
      <div className="text-xs text-muted-foreground">
        Showing chapter 1 of {canonical.length}. The reader, PDF, EPUB and DOCX exports all consume the same canonical structure shown below.
      </div>
      <article className="prose prose-sm dark:prose-invert max-w-none">
        <h1>{first.title}</h1>
        {first.blocks.map((b, i) => <BlockView key={i} block={b} />)}
      </article>
      {report.issues.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">All {report.issues.length} issues</summary>
          <ul className="mt-2 space-y-1">
            {report.issues.map((iss, i) => (
              <li key={i} className="flex items-start gap-2">
                <Badge variant="outline" className="text-[10px] uppercase">{iss.severity}</Badge>
                <span className="text-xs">{iss.message}{iss.hint ? ` — ${iss.hint}` : ""}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function BlockView({ block }: { block: CanonicalChapter["blocks"][number] }) {
  switch (block.kind) {
    case "heading": {
      const Tag = (`h${Math.min(6, Math.max(2, (block.level ?? 2) + 1))}`) as keyof JSX.IntrinsicElements;
      return <Tag>{block.text}</Tag>;
    }
    case "paragraph": return <p>{block.text}</p>;
    case "quote": return <blockquote>{block.text}</blockquote>;
    case "hr": return <hr />;
    case "list":
      return block.list?.ordered
        ? <ol>{block.list.items.map((it, i) => <li key={i}>{it}</li>)}</ol>
        : <ul>{block.list?.items.map((it, i) => <li key={i}>{it}</li>)}</ul>;
    case "code":
      return <pre><code>{block.code?.source}</code></pre>;
    case "image":
      return block.image ? <img src={block.image.src} alt={block.image.alt} className="max-w-full rounded" /> : null;
    case "table":
      if (!block.table) return null;
      return (
        <table>
          <thead><tr>{block.table.header.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
          <tbody>
            {block.table.rows.map((r, i) => (
              <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
            ))}
          </tbody>
        </table>
      );
    case "reference": return <p className="text-xs text-muted-foreground">{block.text}</p>;
    default: return null;
  }
}
