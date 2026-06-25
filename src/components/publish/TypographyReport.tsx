/**
 * Typography Report — surfaces the Page Validator output to the author
 * before they request certification. Click a row to jump to the page.
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { Loader2, ShieldCheck, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type Severity = "blocker" | "warning" | "info";
interface Issue {
  severity: Severity;
  category: string;
  ruleViolated: string;
  pageNumber: number;
  blockId: string;
  message: string;
}
interface Report {
  validationScore: number;
  totalPages: number;
  totalBlocks: number;
  issues: Issue[];
  blockerCount: number;
  warningCount: number;
  publicationReady: boolean;
  byCategory: Record<string, number>;
}
interface GuardResult {
  publicationReady: boolean;
  report: Report;
  perChapter: Array<{ chapter_id: string; chapter_number: number; report: Report }>;
}

const SEV_STYLE: Record<Severity, string> = {
  blocker: "bg-destructive/15 text-destructive border-destructive/30",
  warning: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  info: "bg-muted text-muted-foreground border-border",
};

export default function TypographyReport({ bookId }: { bookId: string }) {
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<GuardResult | null>(null);

  const run = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("validate-publication-typography", {
        body: { book_id: bookId },
      });
      if (error) throw error;
      setResult(data as GuardResult);
      const r = (data as GuardResult).report;
      toast({
        title: r.publicationReady ? "Publication Ready" : "Blockers detected",
        description: `Score ${r.validationScore} · ${r.blockerCount} blocker(s), ${r.warningCount} warning(s)`,
        variant: r.publicationReady ? "default" : "destructive",
      });
    } catch (e) {
      toast({ title: "Validation failed", description: e instanceof Error ? e.message : "Unknown", variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const r = result?.report;

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Typography & Pagination Report</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Deterministic layout validation. Publication is blocked while any P0 rule fails.
          </p>
        </div>
        <Button onClick={run} disabled={running}>
          {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
          Run validation
        </Button>
      </div>

      {r && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-4"
        >
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <div className="text-sm text-muted-foreground">Overall score</div>
              <div className="text-3xl font-semibold text-foreground">{r.validationScore}</div>
              <Progress value={r.validationScore} className="mt-2" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Pages</div>
              <div className="text-3xl font-semibold text-foreground">{r.totalPages}</div>
              <div className="text-xs text-muted-foreground mt-1">{r.totalBlocks} semantic blocks</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Status</div>
              <Badge variant="outline" className={r.publicationReady ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 mt-2" : "bg-destructive/15 text-destructive border-destructive/30 mt-2"}>
                {r.publicationReady
                  ? <><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Publication Ready</>
                  : <><AlertTriangle className="h-3.5 w-3.5 mr-1" /> {r.blockerCount} blocker(s)</>}
              </Badge>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {Object.entries(r.byCategory).map(([cat, n]) => (
              <Badge key={cat} variant="outline" className={n > 0 ? "border-foreground/30" : "opacity-50"}>
                {cat}: {n}
              </Badge>
            ))}
          </div>

          {r.issues.length === 0 ? (
            <div className="text-sm text-muted-foreground border border-border rounded-md p-4">
              No issues detected. This manuscript passes the Typography & Pagination Guard.
            </div>
          ) : (
            <div className="border border-border rounded-md divide-y divide-border max-h-[420px] overflow-y-auto">
              {r.issues.map((it, idx) => (
                <button
                  key={`${it.blockId}-${idx}`}
                  className="w-full text-left p-3 hover:bg-muted/40 transition-colors"
                  onClick={() => toast({ title: `Page ${it.pageNumber}`, description: it.message })}
                >
                  <div className="flex items-start gap-2">
                    <Badge variant="outline" className={SEV_STYLE[it.severity]}>{it.severity}</Badge>
                    <span className="text-xs text-muted-foreground">{it.category} · {it.ruleViolated}</span>
                    <span className="ml-auto text-xs text-muted-foreground">p. {it.pageNumber}</span>
                  </div>
                  <div className="text-sm text-foreground mt-1">{it.message}</div>
                </button>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </Card>
  );
}
