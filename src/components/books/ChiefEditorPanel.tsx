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
  Quote,
  Gavel,
  Award,
  Undo2,
  History,
  Info,
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
  onChaptersUpdated?: () => void;
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
  penalty_log: any[];
  evidence_citations: any[];
  pre_penalty_scores: Record<string, number>;
  certification_eligible: boolean;
  certification_blockers: string[];
  audit_model: string;
  audit_prompt_version: string;
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

const CERT_THRESHOLDS = { structural: 75, academic: 80, pedagogical: 75, overall: 78 };

export function ChiefEditorPanel({ bookId, chapters, onChaptersUpdated, className }: ChiefEditorPanelProps) {
  const { toast } = useToast();
  const [audit, setAudit] = useState<AuditData | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [expandedDimension, setExpandedDimension] = useState<string | null>(null);
  const [showPenalties, setShowPenalties] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const [showBlockers, setShowBlockers] = useState(false);
  const [loading, setLoading] = useState(true);

  const generatedCount = chapters.filter(ch => ch.is_generated).length;

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
      // Fetch book details once outside the loop
      const { data: bookData } = await supabase
        .from("books")
        .select("title, category, book_type, language")
        .eq("id", bookId)
        .single();

      for (const suggestion of audit.chapter_suggestions) {
        const chapter = chapters.find(ch => ch.chapter_number === suggestion.chapterNumber);
        if (!chapter || !chapter.content) continue;

        const improvementPrompt = suggestion.improvements?.join("\n- ") || "";
        if (!improvementPrompt) continue;

        // Save previous content for versioning
        await supabase.from("chapters").update({
          previous_content: chapter.content,
          version_number: ((chapter as any).version_number || 1) + 1,
          audit_id: audit.id,
        }).eq("id", chapter.id);

        // Build comprehensive Chief Editor edit intent with full audit context
        const auditContext = [
          `CURRENT AUDIT SCORES: Structural=${audit.structural_score}/100, Academic=${audit.academic_score}/100, Pedagogical=${audit.pedagogical_score}/100, Overall=${audit.overall_score}/100`,
          `TARGET: ALL dimensions must reach 95-100/100 after this revision.`,
          ``,
          `SPECIFIC IMPROVEMENTS FOR THIS CHAPTER:`,
          `- ${improvementPrompt}`,
          ``,
          `PENALTY VIOLATIONS TO FIX:`,
          ...(audit.penalty_log || [])
            .filter((p: any) => p.chapterNumber === chapter.chapter_number)
            .map((p: any) => `- ${p.rule}: ${p.evidence}`),
          ``,
          `FLAGGED SECTIONS:`,
          ...(audit.flagged_sections || [])
            .filter((f: any) => f.chapterNumber === chapter.chapter_number)
            .map((f: any) => `- [${f.severity}] ${f.section}: ${f.issue} → ${f.suggestion}`),
        ].join("\n");

        const { error } = await supabase.functions.invoke("generate-chapter", {
          body: {
            chapterId: chapter.id,
            bookTitle: bookData?.title || "",
            chapterTitle: chapter.title,
            chapterNumber: chapter.chapter_number,
            category: bookData?.category || "general",
            bookType: bookData?.book_type || "text",
            language: bookData?.language || "en",
            regenerate: true,
            isRegeneration: true,
            originalContent: chapter.content,
            editIntent: `[CHIEF_EDITOR_REWRITE]\n${auditContext}`,
          },
        });

        if (!error) improved++;
        await new Promise(r => setTimeout(r, 2000));
      }

      await supabase.from("book_audits").update({
        improvements_applied: true,
        improvements_applied_at: new Date().toISOString(),
      }).eq("id", audit.id);

      setAudit(prev => prev ? { ...prev, improvements_applied: true } : null);
      onChaptersUpdated?.();

      toast({
        title: "Improvements Applied",
        description: `${improved}/${audit.chapter_suggestions.length} chapters improved. Re-running audit to verify…`,
      });

      // Wait for all chapter saves to propagate before re-auditing
      // Each chapter takes ~2s gap + generation time; add buffer for DB consistency
      const waitTime = Math.max(5000, improved * 2000);
      setTimeout(() => {
        onChaptersUpdated?.();
        runAudit();
      }, waitTime);
    } catch (err) {
      toast({ title: "Failed to apply improvements", description: String(err), variant: "destructive" });
    } finally {
      setIsApplying(false);
    }
  };

  // ============================================================
  // ROLLBACK: Restore previous content
  // ============================================================
  const rollbackImprovements = async () => {
    if (!audit) return;

    setIsRollingBack(true);
    let rolledBack = 0;

    try {
      // Find chapters linked to this audit that have previous_content
      const { data: versionedChapters, error } = await supabase
        .from("chapters")
        .select("id, chapter_number, previous_content, version_number")
        .eq("book_id", bookId)
        .eq("audit_id", audit.id)
        .not("previous_content", "is", null);

      if (error) throw error;

      for (const ch of versionedChapters || []) {
        await supabase.from("chapters").update({
          content: ch.previous_content,
          previous_content: null,
          version_number: Math.max(1, (ch.version_number || 2) - 1),
          audit_id: null,
        }).eq("id", ch.id);
        rolledBack++;
      }

      // Reset improvements_applied flag
      await supabase.from("book_audits").update({
        improvements_applied: false,
        improvements_applied_at: null,
      }).eq("id", audit.id);

      setAudit(prev => prev ? { ...prev, improvements_applied: false } : null);
      onChaptersUpdated?.();

      toast({
        title: "Rollback Complete",
        description: `${rolledBack} chapter(s) restored to pre-improvement state.`,
      });
    } catch (err) {
      toast({ title: "Rollback Failed", description: String(err), variant: "destructive" });
    } finally {
      setIsRollingBack(false);
    }
  };

  if (loading) return null;

  const dimensions = audit ? [
    { key: "structural", label: "Structural Integrity", icon: LayoutList, score: audit.structural_score, findings: audit.structural_findings, threshold: CERT_THRESHOLDS.structural },
    { key: "academic", label: "Academic Rigor", icon: GraduationCap, score: audit.academic_score, findings: audit.academic_findings, threshold: CERT_THRESHOLDS.academic },
    { key: "pedagogical", label: "Pedagogical Quality", icon: BookOpen, score: audit.pedagogical_score, findings: audit.pedagogical_findings, threshold: CERT_THRESHOLDS.pedagogical },
  ] : [];

  const penalties = (audit?.penalty_log || []) as any[];
  const prePenalty = (audit?.pre_penalty_scores || {}) as Record<string, number>;
  const hasPenalties = penalties.length > 0;
  const evidenceCitations = (audit?.evidence_citations || []) as any[];
  const blockers = (audit?.certification_blockers || []) as string[];

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
            <>
              {audit.certification_eligible ? (
                <Badge variant="outline" className="text-xs text-green-500 border-green-500/30">
                  <Award className="h-3 w-3 mr-1" />Cert Eligible
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs text-amber-500 border-amber-500/30">
                  {blockers.length} Blocker{blockers.length !== 1 ? 's' : ''}
                </Badge>
              )}
              <Badge variant="outline" className={cn("text-xs", scoreColor(audit.overall_score))}>
                {audit.overall_score}/100
              </Badge>
            </>
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

                  {/* Certification Gate with Specific Blockers */}
                  <div className={cn(
                    "p-3 rounded-lg border text-xs",
                    audit.certification_eligible
                      ? "bg-green-500/10 border-green-500/30"
                      : "bg-amber-500/10 border-amber-500/30"
                  )}>
                    <div className="flex items-center gap-2 mb-1">
                      <Award className={cn("h-4 w-4", audit.certification_eligible ? "text-green-500" : "text-amber-500")} />
                      <span className={cn("font-medium", audit.certification_eligible ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400")}>
                        {audit.certification_eligible ? "Certification Eligible ✓" : "Certification Blocked"}
                      </span>
                    </div>
                    {blockers.length > 0 ? (
                      <>
                        <button
                          onClick={() => setShowBlockers(!showBlockers)}
                          className="flex items-center gap-1 text-amber-600 dark:text-amber-400 hover:underline mt-1"
                        >
                          <AlertTriangle className="h-3 w-3" />
                          {blockers.length} reason{blockers.length !== 1 ? 's' : ''} blocking certification
                          {showBlockers ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </button>
                        {showBlockers && (
                          <ul className="mt-2 space-y-1">
                            {blockers.map((b, i) => (
                              <li key={i} className="flex items-start gap-1.5 text-amber-700 dark:text-amber-300">
                                <XCircle className="h-3 w-3 mt-0.5 shrink-0" />
                                <span>{b}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    ) : (
                      <p className="text-green-600 dark:text-green-400">
                        All thresholds met: Structural ≥{CERT_THRESHOLDS.structural} · Academic ≥{CERT_THRESHOLDS.academic} · Pedagogical ≥{CERT_THRESHOLDS.pedagogical} · Overall ≥{CERT_THRESHOLDS.overall}
                      </p>
                    )}
                  </div>

                  {/* Dimension Scores */}
                  {dimensions.map(dim => {
                    const rawScore = prePenalty[dim.key];
                    const wasCapped = rawScore !== undefined && rawScore > dim.score;
                    const meetsThreshold = dim.score >= dim.threshold;

                    return (
                      <div key={dim.key} className="rounded-lg border border-border/50 overflow-hidden">
                        <button
                          onClick={() => setExpandedDimension(expandedDimension === dim.key ? null : dim.key)}
                          className="w-full flex items-center justify-between p-3 hover:bg-muted/20 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <dim.icon className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">{dim.label}</span>
                            {wasCapped && (
                              <Badge variant="outline" className="text-[10px] text-destructive border-destructive/30">
                                <Gavel className="h-2.5 w-2.5 mr-0.5" />AI {rawScore} → Capped {dim.score}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {meetsThreshold ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                            ) : (
                              <XCircle className="h-3.5 w-3.5 text-destructive" />
                            )}
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
                                    {finding.quote && finding.quote !== "N/A" && (
                                      <p className="text-muted-foreground mt-1 italic border-l-2 border-scroll-gold/50 pl-2">
                                        <Quote className="h-3 w-3 inline mr-1 text-scroll-gold" />
                                        "{finding.quote.slice(0, 200)}{finding.quote.length > 200 ? '...' : ''}"
                                      </p>
                                    )}
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
                    );
                  })}

                  {/* Deterministic Penalty Log */}
                  {hasPenalties && (
                    <div className="space-y-2">
                      <button
                        onClick={() => setShowPenalties(!showPenalties)}
                        className="flex items-center gap-2 text-sm font-medium w-full hover:text-foreground transition-colors"
                      >
                        <Gavel className="h-4 w-4 text-destructive" />
                        Deterministic Penalties ({penalties.length})
                        {showPenalties ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
                      </button>
                      {showPenalties && penalties.map((p: any, i: number) => (
                        <div key={i} className="text-xs p-2 rounded bg-destructive/5 border border-destructive/20">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-destructive">{p.rule}</span>
                            <Badge variant="outline" className="text-[10px]">Cap: {p.cap}</Badge>
                          </div>
                          <p className="text-muted-foreground mt-0.5">{p.evidence}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Evidence Citations */}
                  {evidenceCitations.length > 0 && (
                    <div className="space-y-2">
                      <button
                        onClick={() => setShowEvidence(!showEvidence)}
                        className="flex items-center gap-2 text-sm font-medium w-full hover:text-foreground transition-colors"
                      >
                        <Quote className="h-4 w-4 text-scroll-gold" />
                        Evidence Citations ({evidenceCitations.length})
                        {showEvidence ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
                      </button>
                      {showEvidence && evidenceCitations.map((e: any, i: number) => (
                        <div key={i} className="text-xs p-2 rounded bg-muted/30 border-l-2 border-scroll-gold/50">
                          <p className="font-medium text-foreground">{e.criterion}</p>
                          <p className="italic text-muted-foreground mt-1">"{e.quote?.slice(0, 300)}{(e.quote?.length || 0) > 300 ? '...' : ''}"</p>
                        </div>
                      ))}
                    </div>
                  )}

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

                  {/* Apply / Rollback Buttons */}
                  {audit.chapter_suggestions?.length > 0 && (
                    <div className="pt-2 space-y-2">
                      {audit.improvements_applied ? (
                        <>
                          <div className="flex items-center gap-2 text-sm text-green-500">
                            <CheckCircle2 className="h-4 w-4" />
                            Improvements applied (versioned). Re-run audit to verify quality gains.
                          </div>
                          <Button
                            onClick={rollbackImprovements}
                            disabled={isRollingBack}
                            variant="outline"
                            size="sm"
                            className="w-full text-destructive border-destructive/30 hover:bg-destructive/10"
                          >
                            {isRollingBack ? (
                              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Rolling back...</>
                            ) : (
                              <><Undo2 className="h-4 w-4 mr-2" />Restore Previous Versions</>
                            )}
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            onClick={applyImprovements}
                            disabled={isApplying}
                            variant="hero"
                            size="sm"
                            className="w-full"
                          >
                            {isApplying ? (
                              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Applying improvements (with versioning)...</>
                            ) : (
                              <><Sparkles className="h-4 w-4 mr-2" />Apply Improvements ({audit.chapter_suggestions.length} chapters)</>
                            )}
                          </Button>
                          <p className="text-[10px] text-muted-foreground text-center">
                            <Undo2 className="h-3 w-3 inline mr-1" />
                            Previous content saved — rollback available after applying
                          </p>
                        </>
                      )}
                    </div>
                  )}

                  {/* Audit Provenance */}
                  {audit.audit_model && (
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground pt-1 border-t border-border/30">
                      <History className="h-3 w-3" />
                      <span>Model: {audit.audit_model} · Prompt: {audit.audit_prompt_version} · {new Date(audit.created_at).toLocaleString()}</span>
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
                    <p className="text-xs text-muted-foreground">Evaluating {generatedCount} chapters with proportional penalty rules</p>
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
