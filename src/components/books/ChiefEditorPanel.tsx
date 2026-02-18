import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  ShieldCheck,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  BookOpen,
  GraduationCap,
  LayoutList,
  Sparkles,
  RefreshCw,
  XCircle,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ChiefEditorPanelProps {
  bookId: string;
  chapters: Array<{
    id: string;
    chapter_number: number;
    title: string;
    content: string | null;
    is_generated: boolean | null;
  }>;
  className?: string;
}

interface AuditData {
  id: string;
  structural_score: number;
  academic_score: number;
  pedagogical_score: number;
  overall_score: number;
  structural_findings: any[];
  academic_findings: any[];
  pedagogical_findings: any[];
  flagged_sections: any[];
  chapter_suggestions: any[];
  status: string;
  improvements_applied: boolean;
  created_at: string;
}

const scoreColor = (score: number) => {
  if (score >= 80) return "text-green-500";
  if (score >= 60) return "text-amber-500";
  return "text-destructive";
};

const scoreLabel = (score: number) => {
  if (score >= 90) return "Excellent";
  if (score >= 80) return "Good";
  if (score >= 70) return "Adequate";
  if (score >= 60) return "Needs Work";
  if (score >= 40) return "Poor";
  return "Critical";
};

const severityColor = (severity: string) => {
  switch (severity) {
    case "critical": return "bg-destructive/10 text-destructive border-destructive/30";
    case "major": return "bg-amber-500/10 text-amber-600 border-amber-500/30";
    default: return "bg-muted text-muted-foreground border-border";
  }
};

export function ChiefEditorPanel({ bookId, chapters, className }: ChiefEditorPanelProps) {
  const { toast } = useToast();
  const [audit, setAudit] = useState<AuditData | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [expandedDimension, setExpandedDimension] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const generatedCount = chapters.filter(ch => ch.is_generated).length;

  // Fetch latest audit on mount
  useEffect(() => {
    const fetchAudit = async () => {
      const { data, error } = await supabase
        .from("book_audits")
        .select("*")
        .eq("book_id", bookId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        setAudit(data as unknown as AuditData);
      }
      setLoading(false);
    };
    fetchAudit();
  }, [bookId]);

  const runAudit = async () => {
    if (generatedCount === 0) {
      toast({ title: "No chapters to audit", description: "Generate chapters first.", variant: "destructive" });
      return;
    }

    setIsRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("chief-editor-audit", {
        body: { bookId, action: "audit" },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      // Refetch the saved audit
      const { data: freshAudit } = await supabase
        .from("book_audits")
        .select("*")
        .eq("id", data.auditId)
        .single();

      if (freshAudit) {
        setAudit(freshAudit as unknown as AuditData);
        setExpanded(true);
      }

      toast({ title: "Editorial Audit Complete", description: `Overall score: ${data.scores.overall}/100` });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Audit failed";
      toast({ title: "Audit Failed", description: message, variant: "destructive" });
    } finally {
      setIsRunning(false);
    }
  };

  const applyImprovements = async () => {
    if (!audit || !audit.chapter_suggestions?.length) {
      toast({ title: "No suggestions to apply", variant: "destructive" });
      return;
    }

    setIsApplying(true);
    let improved = 0;

    try {
      for (const suggestion of audit.chapter_suggestions) {
        const chapter = chapters.find(ch => ch.chapter_number === suggestion.chapterNumber);
        if (!chapter || !chapter.content) continue;

        const improvementPrompt = suggestion.improvements?.join("\n- ") || "";
        if (!improvementPrompt) continue;

        const { error } = await supabase.functions.invoke("generate-chapter", {
          body: {
            chapterId: chapter.id,
            bookTitle: "", // Will be fetched by the function
            chapterTitle: chapter.title,
            chapterNumber: chapter.chapter_number,
            regenerate: true,
            originalContent: chapter.content,
            editIntent: `Chief Editor improvements:\n- ${improvementPrompt}`,
          },
        });

        if (!error) improved++;
        // Brief delay between chapters to avoid rate limits
        await new Promise(r => setTimeout(r, 2000));
      }

      // Mark improvements applied
      await supabase.from("book_audits").update({
        improvements_applied: true,
        improvements_applied_at: new Date().toISOString(),
      }).eq("id", audit.id);

      setAudit(prev => prev ? { ...prev, improvements_applied: true } : null);

      toast({
        title: "Improvements Applied",
        description: `${improved}/${audit.chapter_suggestions.length} chapters improved. Re-run audit to verify.`,
      });
    } catch (err) {
      toast({ title: "Failed to apply improvements", description: String(err), variant: "destructive" });
    } finally {
      setIsApplying(false);
    }
  };

  if (loading) return null;

  const dimensions = audit ? [
    { key: "structural", label: "Structural Integrity", icon: LayoutList, score: audit.structural_score, findings: audit.structural_findings },
    { key: "academic", label: "Academic Rigor", icon: GraduationCap, score: audit.academic_score, findings: audit.academic_findings },
    { key: "pedagogical", label: "Pedagogical Quality", icon: BookOpen, score: audit.pedagogical_score, findings: audit.pedagogical_findings },
  ] : [];

  return (
    <div className={cn("rounded-xl border border-border/50 bg-gradient-card overflow-hidden", className)}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-scroll-gold" />
          <div className="text-left">
            <h3 className="font-medium text-foreground">Chief Editor Review</h3>
            <p className="text-xs text-muted-foreground">
              {audit?.status === "completed"
                ? `Last audit: ${scoreLabel(audit.overall_score)} (${audit.overall_score}/100)`
                : "Run editorial quality control"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {audit?.status === "completed" && (
            <Badge variant="outline" className={cn("text-xs", scoreColor(audit.overall_score))}>
              {audit.overall_score}/100
            </Badge>
          )}
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-4">
              {/* Run/Re-run button */}
              <div className="flex gap-2">
                <Button
                  onClick={runAudit}
                  disabled={isRunning || generatedCount === 0}
                  variant="gold-outline"
                  size="sm"
                  className="flex-1"
                >
                  {isRunning ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Auditing {generatedCount} chapters...</>
                  ) : audit ? (
                    <><RefreshCw className="h-4 w-4 mr-2" />Re-run Audit</>
                  ) : (
                    <><ShieldCheck className="h-4 w-4 mr-2" />Run Editorial Audit</>
                  )}
                </Button>
              </div>

              {/* Scores */}
              {audit?.status === "completed" && (
                <>
                  {/* Overall Score */}
                  <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Overall Quality Score</span>
                      <span className={cn("text-2xl font-bold", scoreColor(audit.overall_score))}>
                        {audit.overall_score}
                      </span>
                    </div>
                    <Progress value={audit.overall_score} className="h-2" />
                    <p className="text-xs text-muted-foreground mt-1">
                      Weighted: Structural 30% · Academic 35% · Pedagogical 35%
                    </p>
                  </div>

                  {/* Dimension Scores */}
                  {dimensions.map(dim => (
                    <div key={dim.key} className="rounded-lg border border-border/50 overflow-hidden">
                      <button
                        onClick={() => setExpandedDimension(expandedDimension === dim.key ? null : dim.key)}
                        className="w-full flex items-center justify-between p-3 hover:bg-muted/20 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <dim.icon className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">{dim.label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={cn("text-sm font-bold", scoreColor(dim.score))}>{dim.score}/100</span>
                          {expandedDimension === dim.key ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </div>
                      </button>

                      <AnimatePresence>
                        {expandedDimension === dim.key && dim.findings?.length > 0 && (
                          <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: "auto" }}
                            exit={{ height: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="px-3 pb-3 space-y-2">
                              {dim.findings.map((finding: any, i: number) => (
                                <div key={i} className="text-xs p-2 rounded bg-muted/30">
                                  <p className="font-medium text-foreground">{finding.criterion}</p>
                                  <p className="text-muted-foreground mt-0.5">{finding.assessment}</p>
                                  {finding.chapterNumbers?.length > 0 && (
                                    <p className="text-muted-foreground mt-0.5">
                                      Chapters: {finding.chapterNumbers.join(", ")}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}

                  {/* Flagged Sections */}
                  {audit.flagged_sections?.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                        Flagged Sections ({audit.flagged_sections.length})
                      </h4>
                      {audit.flagged_sections.map((flag: any, i: number) => (
                        <div key={i} className={cn("text-xs p-3 rounded-lg border", severityColor(flag.severity))}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium">Ch. {flag.chapterNumber}: {flag.section}</span>
                            <Badge variant="outline" className="text-[10px] uppercase">
                              {flag.severity}
                            </Badge>
                          </div>
                          <p className="opacity-80">{flag.issue}</p>
                          <p className="mt-1 font-medium">→ {flag.suggestion}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Chapter Suggestions */}
                  {audit.chapter_suggestions?.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-scroll-gold" />
                        Improvement Suggestions ({audit.chapter_suggestions.length} chapters)
                      </h4>
                      {audit.chapter_suggestions.map((cs: any, i: number) => (
                        <div key={i} className="text-xs p-3 rounded-lg bg-muted/30 border border-border/50">
                          <p className="font-medium text-foreground mb-1">Chapter {cs.chapterNumber}</p>
                          <ul className="space-y-0.5">
                            {cs.improvements?.map((imp: string, j: number) => (
                              <li key={j} className="text-muted-foreground flex items-start gap-1">
                                <span className="text-scroll-gold mt-0.5">•</span>
                                <span>{imp}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Apply Improvements Button */}
                  {audit.chapter_suggestions?.length > 0 && (
                    <div className="pt-2">
                      {audit.improvements_applied ? (
                        <div className="flex items-center gap-2 text-sm text-green-500">
                          <CheckCircle2 className="h-4 w-4" />
                          Improvements applied. Re-run audit to verify quality gains.
                        </div>
                      ) : (
                        <Button
                          onClick={applyImprovements}
                          disabled={isApplying}
                          variant="hero"
                          size="sm"
                          className="w-full"
                        >
                          {isApplying ? (
                            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Applying improvements...</>
                          ) : (
                            <><Sparkles className="h-4 w-4 mr-2" />Apply Improvements ({audit.chapter_suggestions.length} chapters)</>
                          )}
                        </Button>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Running state */}
              {audit?.status === "running" && (
                <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/30">
                  <Loader2 className="h-5 w-5 animate-spin text-scroll-gold" />
                  <div>
                    <p className="text-sm font-medium">Audit in progress...</p>
                    <p className="text-xs text-muted-foreground">Evaluating {generatedCount} chapters across 3 dimensions</p>
                  </div>
                </div>
              )}

              {/* Failed state */}
              {audit?.status === "failed" && (
                <div className="flex items-center gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/30">
                  <XCircle className="h-5 w-5 text-destructive" />
                  <div>
                    <p className="text-sm font-medium text-destructive">Audit failed</p>
                    <p className="text-xs text-muted-foreground">Try running the audit again</p>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
