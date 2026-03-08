import { motion } from "framer-motion";
import { ChevronRight, CheckCircle2, Loader2, Sparkles, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";

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
  onGenerateChapter: (chapter: ChapterData, e: React.MouseEvent) => void;
  onGenerateAll: () => void;
  onNavigateToChapter: (chapter: ChapterData) => void;
}

export function ChapterList({
  bookId, chapters, isOwner, generatingChapterId, isGeneratingAll, generationProgress,
  onGenerateChapter, onGenerateAll, onNavigateToChapter,
}: ChapterListProps) {
  const { t } = useLanguage();

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-display text-2xl font-bold">{t('book.tableOfContents')}</h2>
        {isOwner && chapters.some(ch => !ch.is_generated) && (
          <Button variant="hero" onClick={onGenerateAll} disabled={isGeneratingAll || generatingChapterId !== null}>
            {isGeneratingAll ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t('book.generatingProgress')} {generationProgress.current}/{generationProgress.total}</>
            ) : (
              <><Sparkles className="h-4 w-4 mr-2" />{t('book.generateAllChapters')}</>
            )}
          </Button>
        )}
      </div>

      {isGeneratingAll && (
        <div className="mb-6 p-4 rounded-xl bg-gradient-card border border-scroll-gold/30">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-scroll-gold">{t('book.generatingChapters')}</span>
            <span className="text-sm text-muted-foreground">{generationProgress.current} / {generationProgress.total} {t('book.complete')}</span>
          </div>
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <motion.div className="h-full bg-gradient-to-r from-scroll-gold to-scroll-gold-light" initial={{ width: 0 }} animate={{ width: `${(generationProgress.current / generationProgress.total) * 100}%` }} transition={{ duration: 0.5 }} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{t('book.generationNote')}</p>
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
                <div className="flex items-center justify-between p-4 rounded-xl bg-gradient-card border border-border/50 hover:border-scroll-gold/50 transition-all duration-300 hover:shadow-lg">
                  <button
                    onClick={() => isGenerated && onNavigateToChapter(chapter)}
                    className={`flex items-center gap-4 flex-1 text-left ${!isGenerated ? 'cursor-default' : 'group cursor-pointer'}`}
                    disabled={!isGenerated}
                  >
                    <span className="w-10 h-10 rounded-lg bg-scroll-gold/10 flex items-center justify-center font-display font-bold text-scroll-gold">{chapter.chapter_number}</span>
                    <div>
                      <h3 className={`font-medium text-foreground ${isGenerated ? 'group-hover:text-scroll-gold' : ''} transition-colors`}>{chapter.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        {isGenerated ? `${(chapter.word_count || 0).toLocaleString()} ${t('book.wordsCount')}` : t('book.contentPending')}
                      </p>
                    </div>
                  </button>
                  <div className="flex items-center gap-2">
                    {isGenerating ? (
                      <div className="flex items-center gap-2 text-scroll-gold"><Loader2 className="h-5 w-5 animate-spin" /><span className="text-sm">{t('book.generating')}</span></div>
                    ) : isGenerated ? (
                      <div className="flex items-center gap-2">
                        {isOwner && (
                          <Button variant="ghost" size="sm" onClick={(e) => onGenerateChapter(chapter, e)} title="Regenerate chapter" className="text-muted-foreground hover:text-scroll-gold">
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                        )}
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                        <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-scroll-gold transition-all cursor-pointer" onClick={() => onNavigateToChapter(chapter)} />
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
