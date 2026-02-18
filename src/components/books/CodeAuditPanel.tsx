/**
 * STO Code Audit Panel
 * Senior Technical Officer review of all code blocks in book chapters.
 * Runs chapter-by-chapter audit via AI, with auto-fix capability.
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
  Wrench,
  Sparkles,
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
  onChaptersUpdated?: () => void;
}

/**
 * Replace code blocks in chapter content with corrected versions.
 * Matches fenced code blocks (```...```) and [CODE_BLOCK] tags in order.
 */
function applyCodeFixes(content: string, fixes: CodeBlockAudit[]): string {
  if (!fixes || fixes.length === 0) return content;

  // Build correction map keyed by 0-based index.
  // The AI may return 1-based indices, so we normalise: use array position as fallback.
  const correctionMap = new Map<number, string>();
  for (let i = 0; i < fixes.length; i++) {
    const fix = fixes[i];
    if (fix.correctedCode && fix.issues.length > 0) {
      // AI returns 0-based indices per prompt instructions
      const blockIdx = typeof fix.index === 'number' ? fix.index : i;
      correctionMap.set(blockIdx, fix.correctedCode);
    }
  }
  if (correctionMap.size === 0) return content;

  let result = content;
  let blockIndex = 0;

  // Replace fenced code blocks in order
  const fencedRegex = /```(\w+)?\s*\n([\s\S]*?)```/g;
  result = result.replace(fencedRegex, (match, lang) => {
    const currentIdx = blockIndex++;
    const correction = correctionMap.get(currentIdx);
    if (correction) {
      const language = lang || '';
      return `\`\`\`${language}\n${correction}\n\`\`\``;
    }
    return match;
  });

  // Replace [CODE_BLOCK] tags
  const structuredRegex = /\[CODE_BLOCK\]([\s\S]*?)\[\/CODE_BLOCK\]/g;
  result = result.replace(structuredRegex, (match) => {
    const currentIdx = blockIndex++;
    const correction = correctionMap.get(currentIdx);
    if (correction) {
      return `[CODE_BLOCK]\n${correction}\n[/CODE_BLOCK]`;
    }
    return match;
  });

  return result;
}

export function CodeAuditPanel({ bookId, chapters, className, onChaptersUpdated }: CodeAuditPanelProps) {
  const { toast } = useToast();
  const [isAuditing, setIsAuditing] = useState(false);
  const [isApplyingFixes, setIsApplyingFixes] = useState(false);
  const [applyingChapterId, setApplyingChapterId] = useState<string | null>(null);
  const [auditProgress, setAuditProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<ChapterAuditResult[]>([]);
  const [fixedChapters, setFixedChapters] = useState<Set<string>>(new Set());
  const [expandedChapter, setExpandedChapter] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);

  const generatedChapters = chapters.filter(ch => ch.is_generated && ch.content);

  /** Invoke audit with client-side retry on 429 */
  const auditWithRetry = async (chapter: ChapterData, maxRetries = 2): Promise<ChapterAuditResult> => {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        const backoff = attempt * 30000; // 30s, 60s
        toast({ title: `Rate limited — waiting ${backoff / 1000}s before retrying Ch ${chapter.chapter_number}…` });
        await new Promise(r => setTimeout(r, backoff));
      }

      const response = await supabase.functions.invoke('audit-code', {
        body: {
          chapterId: chapter.id,
          chapterTitle: chapter.title,
          chapterNumber: chapter.chapter_number,
          content: chapter.content,
        },
      });

      if (response.error) {
        const errMsg = response.error.message || '';
        const is429 = errMsg.includes('429') || errMsg.includes('rate_limited') || errMsg.includes('rate');
        if (is429 && attempt < maxRetries) continue;
        throw new Error(response.error.message);
      }

      return response.data as ChapterAuditResult;
    }
    throw new Error('Max retries exceeded');
  };

  const handleRunAudit = async () => {
    if (generatedChapters.length === 0) {
      toast({ title: "No generated chapters to audit", variant: "destructive" });
      return;
    }

    setIsAuditing(true);
    setResults([]);
    setFixedChapters(new Set());
    setAuditProgress({ current: 0, total: generatedChapters.length });

    const newResults: ChapterAuditResult[] = [];

    for (let i = 0; i < generatedChapters.length; i++) {
      const chapter = generatedChapters[i];
      
      // 8s gap between chapters to stay well under rate limits
      if (i > 0) {
        await new Promise(r => setTimeout(r, 8000));
      }

      try {
        const result = await auditWithRetry(chapter);
        newResults.push(result);
      } catch (error) {
        console.error(`Audit failed for chapter ${chapter.chapter_number}:`, error);
        newResults.push({
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
        } as ChapterAuditResult);
      }

      setResults([...newResults]);
      setAuditProgress({ current: i + 1, total: generatedChapters.length });
    }

    setIsAuditing(false);
    
    const validResults = newResults.filter(r => r.result.chapterScore > 0);
    const avgScore = validResults.length > 0
      ? (validResults.reduce((sum, r) => sum + r.result.chapterScore, 0) / validResults.length).toFixed(1)
      : 'N/A';
    
    const fixableCount = newResults.filter(r => 
      r.result.codeBlocks?.some(b => b.correctedCode && b.issues.length > 0)
    ).length;

    toast({
      title: "STO Audit Complete",
      description: `Reviewed ${generatedChapters.length} chapters. Average: ${avgScore}/10. ${fixableCount} chapters have auto-fixable issues.`,
    });
  };

  /** Apply corrected code to a single chapter — with versioning for rollback */
  const handleApplyFixes = async (result: ChapterAuditResult) => {
    const chapter = chapters.find(ch => ch.id === result.chapterId);
    if (!chapter?.content) return;

    setIsApplyingFixes(true);
    setApplyingChapterId(result.chapterId);

    try {
      const fixedContent = applyCodeFixes(chapter.content, result.result.codeBlocks);

      // Save previous_content for rollback (matches Chief Editor pattern)
      const { error } = await supabase
        .from('chapters')
        .update({ 
          content: fixedContent, 
          previous_content: chapter.content,
          version_number: ((chapter as any).version_number || 1) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', result.chapterId);

      if (error) throw error;

      setFixedChapters(prev => new Set(prev).add(result.chapterId));
      toast({
        title: `Chapter ${result.chapterNumber} fixed`,
        description: `Applied ${result.result.codeBlocks.filter(b => b.correctedCode && b.issues.length > 0).length} code corrections. Rollback available.`,
      });
      onChaptersUpdated?.();
    } catch (error) {
      console.error('Failed to apply fixes:', error);
      toast({ title: "Failed to apply fixes", description: error instanceof Error ? error.message : 'Unknown error', variant: "destructive" });
    } finally {
      setIsApplyingFixes(false);
      setApplyingChapterId(null);
    }
  };

  /** Apply all fixes across all chapters with issues */
  const handleApplyAllFixes = async () => {
    const fixableResults = results.filter(r => 
      r.result.codeBlocks?.some(b => b.correctedCode && b.issues.length > 0) &&
      !fixedChapters.has(r.chapterId)
    );

    if (fixableResults.length === 0) {
      toast({ title: "No fixes to apply" });
      return;
    }

    setIsApplyingFixes(true);
    let fixed = 0;

    for (const result of fixableResults) {
      setApplyingChapterId(result.chapterId);
      const chapter = chapters.find(ch => ch.id === result.chapterId);
      if (!chapter?.content) continue;

      try {
        const fixedContent = applyCodeFixes(chapter.content, result.result.codeBlocks);
        // Save previous_content for rollback (matches Chief Editor pattern)
        const { error } = await supabase
          .from('chapters')
          .update({ 
            content: fixedContent, 
            previous_content: chapter.content,
            version_number: ((chapter as any).version_number || 1) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', result.chapterId);

        if (error) throw error;
        setFixedChapters(prev => new Set(prev).add(result.chapterId));
        fixed++;
      } catch (error) {
        console.error(`Failed to fix chapter ${result.chapterNumber}:`, error);
      }
    }

    setIsApplyingFixes(false);
    setApplyingChapterId(null);
    onChaptersUpdated?.();
    toast({
      title: "Auto-Fix Complete",
      description: `Applied corrections to ${fixed}/${fixableResults.length} chapters.`,
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

  const hasFixableIssues = (result: ChapterAuditResult) =>
    result.result.codeBlocks?.some(b => b.correctedCode && b.issues.length > 0) && !fixedChapters.has(result.chapterId);

  const totalFixable = results.filter(r => hasFixableIssues(r)).length;

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
        <div className="flex items-center gap-2">
          {totalFixable > 0 && !isAuditing && (
            <Button
              variant="default"
              size="sm"
              onClick={handleApplyAllFixes}
              disabled={isApplyingFixes}
            >
              {isApplyingFixes ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Fixing…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Auto-Fix All ({totalFixable})
                </>
              )}
            </Button>
          )}
          <Button
            variant="gold-outline"
            size="sm"
            onClick={handleRunAudit}
            disabled={isAuditing || isApplyingFixes || generatedChapters.length === 0}
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
      </div>

      {/* Progress */}
      {isAuditing && (
        <div className="mb-4">
          <Progress value={(auditProgress.current / auditProgress.total) * 100} className="h-2" />
          <p className="text-xs text-muted-foreground mt-1">
            Reviewing one chapter at a time (4s delay to avoid rate limits)…
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
                  {fixedChapters.size > 0 && (
                    <span className="flex items-center gap-1">
                      <Wrench className="h-3 w-3 text-scroll-gold" />
                      {fixedChapters.size} fixed
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {results.map((result) => {
            const badge = getScoreBadge(result.result.chapterScore);
            const isExpanded = expandedChapter === result.chapterId;
            const isFixed = fixedChapters.has(result.chapterId);
            const canFix = hasFixableIssues(result);
            const isFixingThis = applyingChapterId === result.chapterId;

            return (
              <Collapsible
                key={result.chapterId}
                open={isExpanded}
                onOpenChange={() => setExpandedChapter(isExpanded ? null : result.chapterId)}
              >
                <CollapsibleTrigger className="w-full flex items-center justify-between p-3 rounded-lg bg-background/50 border border-border/30 hover:border-scroll-gold/30 transition-colors text-left">
                  <div className="flex items-center gap-3">
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    {isFixed ? <Wrench className="h-4 w-4 text-scroll-gold" /> : getRiskIcon(result.result.riskLevel)}
                    <span className="text-sm font-medium">
                      Ch {result.chapterNumber}: {result.chapterTitle}
                    </span>
                    {isFixed && (
                      <Badge variant="outline" className="text-scroll-gold border-scroll-gold/30 text-[10px]">Fixed</Badge>
                    )}
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
                    {/* Summary + Apply Fixes button */}
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm text-muted-foreground flex-1">{result.result.summary}</p>
                      {canFix && (
                        <Button
                          variant="default"
                          size="sm"
                          className="shrink-0"
                          onClick={(e) => { e.stopPropagation(); handleApplyFixes(result); }}
                          disabled={isApplyingFixes}
                        >
                          {isFixingThis ? (
                            <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Applying…</>
                          ) : (
                            <><Wrench className="h-3 w-3 mr-1" /> Apply Fixes</>
                          )}
                        </Button>
                      )}
                      {isFixed && (
                        <Badge variant="outline" className="text-green-600 border-green-500/30 shrink-0">
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Applied
                        </Badge>
                      )}
                    </div>

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
          <br />
          <span className="text-scroll-gold">Issues found will be auto-fixed in your chapters.</span>
        </p>
      )}
    </div>
  );
}
