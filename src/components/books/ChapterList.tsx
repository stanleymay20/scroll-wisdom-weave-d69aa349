import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronRight, CheckCircle2, Loader2, Sparkles, RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { runPublicationQualityPipeline } from "@/lib/publicationPipeline";
import { supabase } from "@/integrations/supabase/client";

interface ChapterData {
  id: string;
  chapter_number: number;
  title: string;
  word_count: number | null;
  is_generated: boolean | null;
  content: string | null;
}

interface ChapterListProps {
  bookId: string;
  chapters: ChapterData[];
  isOwner: boolean;
  generatingChapterId: string | null;
  isGeneratingAll: boolean;
  generationProgress: { current: number; total: number };
  qualityStage?: string | null;
  onGenerateChapter: (chapter: ChapterData, e: React.MouseEvent) => void;
  onGenerateAll: () => Promise<void> | void;
  onNavigateToChapter: (chapter: ChapterData) => void;
}

type JobStatus = "pending" | "generating" | "completed" | "failed" | "partial";

interface LatestJob {
  id: string;
  status: JobStatus;
}

const OUTLINE_PLACEHOLDER = "Full chapter content is being generated";

const isPlaceholderChapter = (chapter: ChapterData) =>
  !chapter.is_generated && Boolean(chapter.content?.includes(OUTLINE_PLACEHOLDER));

const isCompleteChapter = (chapter: ChapterData) =>
  chapter.is_generated === true && Boolean(chapter.content && chapter.content.trim().length > 0);

export function ChapterList({
  bookId, chapters, isOwner, generatingChapterId, isGeneratingAll, generationProgress,
  qualityStage: qualityStageOverride, onGenerateChapter, onGenerateAll, onNavigateToChapter,
}: ChapterListProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [isQualityReview, setIsQualityReview] = useState(false);
  const [localQualityStage, setLocalQualityStage] = useState<string | null>(null);
  const [latestJob, setLatestJob] = useState<LatestJob | null>(null);
  const [jobLoaded, setJobLoaded] = useState(false);
  const autoStartedRef = useRef(false);
  const qualityStage = qualityStageOverride || localQualityStage;
  const isBusy = isGeneratingAll || isQualityReview;

  // Load latest generation job so an interrupted session can resume.
  // Fail closed: if loading errors, log only a safe diagnostic code, leave
  // latestJob null, and still mark the job loaded so manual chapter controls
  // remain usable.
  useEffect(() => {
    if (!isOwner || !bookId) {
      setJobLoaded(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("generation_jobs")
        .select("id, status")
        .eq("book_id", bookId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.warn(
          "[ChapterList] generation_jobs load failed:",
          error.code ?? "unknown",
        );
        setLatestJob(null);
      } else {
        setLatestJob(data ? { id: data.id as string, status: data.status as JobStatus } : null);
      }
      setJobLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [bookId, isOwner]);

  const runQualityReview = useCallback(async () => {
    setIsQualityReview(true);
    setLocalQualityStage("Preparing the completed draft for independent publication review…");

    try {
      const result = await runPublicationQualityPipeline({
        bookId,
        maxRevisionPasses: 2,
        onStage: (_stage, message) => setLocalQualityStage(message),
      });

      if (result.ready) {
        // The pipeline owns the final database verdict and metadata.
        // Only update local state so the UI reflects certification; do not
        // overwrite any publication-quality metadata persisted by the pipeline.
        if (latestJob) {
          setLatestJob({ ...latestJob, status: "completed" });
        }
        toast({
          title: "Publication candidate verified",
          description: `Editorial ${result.editorial.score ?? "—"}/100 · evidence and publishability gates passed.`,
        });
      } else {
        // Pipeline already persisted the partial verdict; surface the manual
        // Retry publication review action without a reload by updating local state.
        if (latestJob) {
          setLatestJob({ ...latestJob, status: "partial" });
        }
        toast({
          title: "Draft complete — certification blocked",
          description: result.blockers.slice(0, 2).join(" ") || "Quality gates found issues that still require review.",
          variant: "destructive",
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Publication review failed";
      setLocalQualityStage(`Quality review stopped: ${message}`);

      // Fail closed: the pipeline threw before persisting a verdict, so mark
      // the in-flight job partial so no automatic expensive retry loop occurs
      // and the manual Retry action stays visible. Do not store the raw
      // upstream exception in the database.
      if (latestJob && (latestJob.status === "pending" || latestJob.status === "generating")) {
        const { error: updateError } = await supabase
          .from("generation_jobs")
          .update({
            status: "partial",
            completed_at: null,
            error_code: "QUALITY_PIPELINE_ERROR",
            error_message:
              "Publication quality review stopped before certification completed.",
          })
          .eq("id", latestJob.id);
        if (updateError) {
          console.warn(
            "[ChapterList] generation_jobs partial-mark failed:",
            updateError.code ?? "unknown",
          );
        }
        setLatestJob({ ...latestJob, status: "partial" });
      }

      toast({
        title: "Draft complete — quality review incomplete",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsQualityReview(false);
    }
  }, [bookId, latestJob, toast]);

  const handleGenerateAllAndCertify = useCallback(async () => {
    if (isGeneratingAll || isQualityReview) return;

    await onGenerateAll();

    // Fail closed: verify every chapter really exists with content before reviewing
    setLocalQualityStage("Verifying every chapter is complete…");
    const { data: verifyRows, error: verifyError } = await supabase
      .from("chapters")
      .select("id, is_generated, content")
      .eq("book_id", bookId);

    const incomplete = verifyError
      ? -1
      : (verifyRows ?? []).filter(
          (row) => row.is_generated !== true || !row.content || row.content.trim().length === 0,
        ).length;

    if (verifyError || incomplete !== 0 || (verifyRows ?? []).length === 0) {
      const description = verifyError
        ? "Could not confirm that every chapter finished. Publication review was not started."
        : `${incomplete > 0 ? incomplete : "Some"} chapter(s) are still incomplete. Publication review was not started — you can resume generation.`;
      setLocalQualityStage(`Publication review blocked: ${description}`);
      toast({ title: "Publication review blocked", description, variant: "destructive" });
      return;
    }

    await runQualityReview();
  }, [bookId, isGeneratingAll, isQualityReview, onGenerateAll, runQualityReview, toast]);

  useEffect(() => {
    if (!isOwner || !jobLoaded || autoStartedRef.current || isBusy || chapters.length === 0) return;
    if (!latestJob) return; // never auto-generate a manual/imported book
    if (latestJob.status !== "pending" && latestJob.status !== "generating") return;

    const ungenerated = chapters.filter((chapter) => !isCompleteChapter(chapter));
    const resumableOutline = ungenerated.length > 0 && ungenerated.every(isPlaceholderChapter);
    const awaitingReview = ungenerated.length === 0;

    if (!resumableOutline && !awaitingReview) return;

    autoStartedRef.current = true;
    if (awaitingReview) {
      void runQualityReview();
    } else {
      void handleGenerateAllAndCertify();
    }
  }, [chapters, handleGenerateAllAndCertify, runQualityReview, isBusy, isOwner, jobLoaded, latestJob]);

  const allGenerated = chapters.length > 0 && chapters.every(isCompleteChapter);
  const showRetryReview =
    isOwner && allGenerated && !isBusy &&
    (latestJob?.status === "partial" || latestJob?.status === "failed");

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-display text-2xl font-bold">{t('book.tableOfContents')}</h2>
        {showRetryReview ? (
          <Button variant="gold-outline" onClick={() => void runQualityReview()}>
            <ShieldAlert className="h-4 w-4 mr-2" />Retry publication review
          </Button>
        ) : isOwner && (chapters.some(ch => !ch.is_generated) || isQualityReview) ? (
          <Button
            variant="hero"
            onClick={handleGenerateAllAndCertify}
            disabled={isBusy || generatingChapterId !== null}
          >
            {isBusy ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {isQualityReview
                  ? "Quality review"
                  : `${t('book.generatingProgress')} ${generationProgress.current}/${generationProgress.total}`}
              </>
            ) : (
              <><Sparkles className="h-4 w-4 mr-2" />{t('book.generateAllChapters')}</>
            )}
          </Button>
        ) : null}
      </div>


      {isBusy && (
        <div className="mb-6 p-4 rounded-xl bg-gradient-card border border-primary/30" aria-live="polite">
          <div className="flex items-center justify-between mb-2 gap-4">
            <span className="text-sm font-medium text-primary">
              {isQualityReview ? "Publication quality pipeline" : t('book.generatingChapters')}
            </span>
            {!isQualityReview && (
              <span className="text-sm text-muted-foreground">
                {generationProgress.current} / {generationProgress.total} {t('book.complete')}
              </span>
            )}
          </div>
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-primary to-primary-light"
              initial={{ width: 0 }}
              animate={{
                width: isQualityReview
                  ? "100%"
                  : `${generationProgress.total > 0 ? (generationProgress.current / generationProgress.total) * 100 : 0}%`,
              }}
              transition={{ duration: 0.5 }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {qualityStage || t('book.generationNote')}
          </p>
        </div>
      )}

      {chapters.length === 0 ? (
        <p className="text-muted-foreground">{t('book.chaptersBeingGenerated')}</p>
      ) : (
        <div className="space-y-3">
          {chapters.map((chapter, index) => {
            const isGenerating = generatingChapterId === chapter.id;
            const isGenerated = chapter.is_generated;
            return (
              <motion.div key={chapter.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + index * 0.05 }}>
                <div className="flex items-center justify-between p-4 rounded-xl bg-gradient-card border border-border/50 hover:border-primary/50 transition-all duration-300 hover:shadow-lg">
                  <button
                    onClick={() => isGenerated && onNavigateToChapter(chapter)}
                    className={`flex items-center gap-4 flex-1 text-left ${!isGenerated ? 'cursor-default' : 'group cursor-pointer'}`}
                    disabled={!isGenerated}
                  >
                    <span className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center font-display font-bold text-primary">{chapter.chapter_number}</span>
                    <div>
                      <h3 className={`font-medium text-foreground ${isGenerated ? 'group-hover:text-primary' : ''} transition-colors`}>{chapter.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        {isGenerated ? `${(chapter.word_count || 0).toLocaleString()} ${t('book.wordsCount')}` : t('book.contentPending')}
                      </p>
                    </div>
                  </button>
                  <div className="flex items-center gap-2">
                    {isGenerating ? (
                      <div className="flex items-center gap-2 text-primary"><Loader2 className="h-5 w-5 animate-spin" /><span className="text-sm">{t('book.generating')}</span></div>
                    ) : isGenerated ? (
                      <div className="flex items-center gap-2">
                        {isOwner && (
                          <Button variant="ghost" size="sm" onClick={(e) => onGenerateChapter(chapter, e)} title="Regenerate chapter" className="text-muted-foreground hover:text-primary">
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                        )}
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                        <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-all cursor-pointer" onClick={() => onNavigateToChapter(chapter)} />
                      </div>
                    ) : isOwner ? (
                      <Button variant="gold-outline" size="sm" onClick={(e) => onGenerateChapter(chapter, e)}>
                        <Sparkles className="h-4 w-4 mr-1" />{t('book.generateChapter')}
                      </Button>
                    ) : (
                      <span className="text-sm text-muted-foreground">{t('book.contentPending')}</span>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}