/**
 * STO Code Audit Panel
 * Senior Technical Officer review of all code blocks in book chapters.
 * Runs chapter-by-chapter audit via AI.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Shield,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Code2,
  Copy,
  Check,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface ChapterData {
  id: string;
  chapter_number: number;
  title: string;
  content: string | null;
  is_generated: boolean | null;
}

interface CodeBlockAudit {
  index: number;
  language: string;
  originalSnippet: string;
  issues: string[];
  correctedCode: string;
  recommendations: string[];
}

interface ChapterAuditResult {
  chapterId: string;
  chapterTitle: string;
  chapterNumber: number;
  codeBlockCount: number;
  result: {
    chapterScore: number;
    riskLevel: string;
    codeBlocks: CodeBlockAudit[];
    overallRecommendations: string[];
    summary: string;
  };
}

interface CodeAuditPanelProps {
  bookId: string;
  chapters: ChapterData[];
  className?: string;
}

export function CodeAuditPanel({ bookId, chapters, className }: CodeAuditPanelProps) {
  const { toast } = useToast();
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditProgress, setAuditProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<ChapterAuditResult[]>([]);
  const [expandedChapter, setExpandedChapter] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);

  const generatedChapters = chapters.filter(ch => ch.is_generated && ch.content);

  const handleRunAudit = async () => {
    if (generatedChapters.length === 0) {
      toast({ title: "No generated chapters to audit", variant: "destructive" });
      return;
    }

    setIsAuditing(true);
    setResults([]);
    setAuditProgress({ current: 0, total: generatedChapters.length });

    const batchSize = 3;
    const newResults: ChapterAuditResult[] = [];

    for (let i = 0; i < generatedChapters.length; i += batchSize) {
      const batch = generatedChapters.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (chapter) => {
        try {
          const response = await supabase.functions.invoke('audit-code', {
            body: {
              chapterId: chapter.id,
              chapterTitle: chapter.title,
              chapterNumber: chapter.chapter_number,
              content: chapter.content,
            },
          });

          if (response.error) throw new Error(response.error.message);
          return response.data as ChapterAuditResult;
        } catch (error) {
          console.error(`Audit failed for chapter ${chapter.chapter_number}:`, error);
          return {
            chapterId: chapter.id,
            chapterTitle: chapter.title,
            chapterNumber: chapter.chapter_number,
            codeBlockCount: 0,
            result: {
              chapterScore: -1,
              riskLevel: 'error',
              codeBlocks: [],
              overallRecommendations: [`Audit failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
              summary: 'Audit could not be completed for this chapter.',
            },
          } as ChapterAuditResult;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      newResults.push(...batchResults);
      setResults([...newResults]);
      setAuditProgress({ current: Math.min(i + batchSize, generatedChapters.length), total: generatedChapters.length });
    }

    setIsAuditing(false);
    
    const validResults = newResults.filter(r => r.result.chapterScore > 0);
    const avgScore = validResults.length > 0
      ? (validResults.reduce((sum, r) => sum + r.result.chapterScore, 0) / validResults.length).toFixed(1)
      : 'N/A';

    toast({
      title: "STO Audit Complete",
      description: `Reviewed ${generatedChapters.length} chapters. Average score: ${avgScore}/10`,
    });
  };

  const handleCopyCode = async (code: string, key: string) => {
    await navigator.clipboard.writeText(code);
    setCopiedIndex(key);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const getScoreBadge = (score: number) => {
    if (score === -1) return { variant: 'outline' as const, label: 'No Code', color: 'text-muted-foreground' };
    if (score >= 8) return { variant: 'default' as const, label: `${score}/10`, color: 'text-green-500' };
    if (score >= 5) return { variant: 'secondary' as const, label: `${score}/10`, color: 'text-yellow-500' };
    return { variant: 'destructive' as const, label: `${score}/10`, color: 'text-destructive' };
  };

  const getRiskIcon = (risk: string) => {
    if (risk === 'low' || risk === 'none') return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    if (risk === 'medium') return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    return <XCircle className="h-4 w-4 text-destructive" />;
  };

  return (
    <div className={cn("rounded-xl border border-border/50 bg-muted/20 p-5", className)}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Shield className="h-5 w-5 text-scroll-gold" />
          <div>
            <h3 className="font-semibold text-foreground">STO Code Audit</h3>
            <p className="text-xs text-muted-foreground">
              Senior Technical Officer review · FAANG-grade standards
            </p>
          </div>
        </div>
        <Button
          variant="gold-outline"
          size="sm"
          onClick={handleRunAudit}
          disabled={isAuditing || generatedChapters.length === 0}
        >
          {isAuditing ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Auditing {auditProgress.current}/{auditProgress.total}
            </>
          ) : (
            <>
              <Code2 className="h-4 w-4 mr-2" />
              Run Full Audit
            </>
          )}
        </Button>
      </div>

      {/* Progress */}
      {isAuditing && (
        <div className="mb-4">
          <Progress value={(auditProgress.current / auditProgress.total) * 100} className="h-2" />
          <p className="text-xs text-muted-foreground mt-1">
            Reviewing chapters in batches of 3…
          </p>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-2 mt-4">
          {/* Summary */}
          {!isAuditing && (
            <div className="p-3 rounded-lg bg-background/50 border border-border/30 mb-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">Audit Summary</span>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                    {results.filter(r => r.result.chapterScore >= 8).length} excellent
                  </span>
                  <span className="flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3 text-yellow-500" />
                    {results.filter(r => r.result.chapterScore >= 5 && r.result.chapterScore < 8).length} needs work
                  </span>
                  <span className="flex items-center gap-1">
                    <XCircle className="h-3 w-3 text-destructive" />
                    {results.filter(r => r.result.chapterScore > 0 && r.result.chapterScore < 5).length} critical
                  </span>
                </div>
              </div>
            </div>
          )}

          {results.map((result) => {
            const badge = getScoreBadge(result.result.chapterScore);
            const isExpanded = expandedChapter === result.chapterId;

            return (
              <Collapsible
                key={result.chapterId}
                open={isExpanded}
                onOpenChange={() => setExpandedChapter(isExpanded ? null : result.chapterId)}
              >
                <CollapsibleTrigger className="w-full flex items-center justify-between p-3 rounded-lg bg-background/50 border border-border/30 hover:border-scroll-gold/30 transition-colors text-left">
                  <div className="flex items-center gap-3">
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    {getRiskIcon(result.result.riskLevel)}
                    <span className="text-sm font-medium">
                      Ch {result.chapterNumber}: {result.chapterTitle}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {result.codeBlockCount > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {result.codeBlockCount} blocks
                      </span>
                    )}
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="p-4 border border-t-0 border-border/30 rounded-b-lg bg-background/30 space-y-4">
                    {/* Summary */}
                    <p className="text-sm text-muted-foreground">{result.result.summary}</p>

                    {/* Code Block Details */}
                    {result.result.codeBlocks?.map((block, bi) => (
                      <div key={bi} className="border border-border/30 rounded-lg overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b border-border/30">
                          <span className="text-xs font-medium">
                            Block {block.index + 1} ({block.language})
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {block.issues.length} issue(s)
                          </span>
                        </div>

                        {/* Issues */}
                        {block.issues.length > 0 && (
                          <div className="px-3 py-2 border-b border-border/20">
                            <ul className="text-xs space-y-1">
                              {block.issues.map((issue, ii) => (
                                <li key={ii} className="flex items-start gap-2 text-destructive">
                                  <XCircle className="h-3 w-3 mt-0.5 shrink-0" />
                                  {issue}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Corrected Code */}
                        {block.correctedCode && (
                          <div className="relative">
                            <div className="flex items-center justify-between px-3 py-1 bg-green-500/5 border-b border-border/20">
                              <span className="text-xs text-green-600 font-medium">✅ Corrected Code</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2"
                                onClick={() => handleCopyCode(block.correctedCode, `${result.chapterId}-${bi}`)}
                              >
                                {copiedIndex === `${result.chapterId}-${bi}` ? (
                                  <Check className="h-3 w-3" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </Button>
                            </div>
                            <pre className="p-3 text-xs overflow-x-auto bg-background/50 max-h-64">
                              <code>{block.correctedCode}</code>
                            </pre>
                          </div>
                        )}

                        {/* Recommendations */}
                        {block.recommendations?.length > 0 && (
                          <div className="px-3 py-2 bg-blue-500/5">
                            <ul className="text-xs space-y-1">
                              {block.recommendations.map((rec, ri) => (
                                <li key={ri} className="flex items-start gap-2 text-blue-600">
                                  <ChevronRight className="h-3 w-3 mt-0.5 shrink-0" />
                                  {rec}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Overall Recommendations */}
                    {result.result.overallRecommendations?.length > 0 && (
                      <div className="p-3 rounded-lg bg-scroll-gold/5 border border-scroll-gold/20">
                        <h4 className="text-xs font-semibold text-scroll-gold mb-2">Senior Engineer Recommendations</h4>
                        <ul className="text-xs space-y-1">
                          {result.result.overallRecommendations.map((rec, ri) => (
                            <li key={ri} className="text-muted-foreground">• {rec}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {results.length === 0 && !isAuditing && (
        <p className="text-xs text-muted-foreground text-center py-4">
          Run a full audit to review all code blocks against FAANG-grade engineering standards.
          <br />
          Covers: correctness, PEP8, reproducibility, ML best practices, deployment patterns.
        </p>
      )}
    </div>
  );
}
