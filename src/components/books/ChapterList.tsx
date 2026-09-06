import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronRight, CheckCircle2, Loader2, Sparkles, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { runPublicationQualityPipeline } from "@/lib/publicationPipeline";

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

export function ChapterList({
  bookId, chapters, isOwner, generatingChapterId, isGeneratingAll, generationProgress,
  qualityStage: qualityStageOverride, onGenerateChapter, onGenerateAll, onNavigateToChapter,
}: ChapterListProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [isQualityReview, setIsQualityReview] = useState(false);
  const [localQualityStage, setLocalQualityStage] = useState<string | null>(null);
  const qualityStage = qualityStageOverride || localQualityStage;
  const isBusy = isGeneratingAll || isQualityReview;

  const handleGenerateAllAndCertify = async () => {
    if (isBusy) return;

    await onGenerateAll();

    setIsQualityReview(true);
    setLocalQualityStage("Preparing the completed draft for independent publication review…");

    try {
      const result = await runPublicationQualityPipeline({
        bookId,
        maxRevisionPasses: 2,
        onStage: (_stage, message) => setLocalQualityStage(message),
      });

      if (result.ready) {
        toast({
          title: "Publication candidate verified",
          description: `Editorial ${result.editorial.score ?? "—"}/100 · evidence and publishability gates passed.`,
        });
      } else {
        toast({
          title: "Draft complete — certification blocked",
          description: result.blockers.slice(0, 2).join(" ") || "Quality gates found issues that still require review.",
          variant: "destructive",
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Publication review failed";
      setLocalQualityStage(`Quality review stopped: ${message}`);
      toast({
        title: "Draft complete — quality review incomplete",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsQualityReview(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-display text-2xl font-bold">{t('book.tableOfContents')}</h2>
        {isOwner && (chapters.some(ch => !ch.is_generated) || isQualityReview) && (
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
        )}
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