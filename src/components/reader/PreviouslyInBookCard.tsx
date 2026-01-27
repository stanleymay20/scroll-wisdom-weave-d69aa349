/**
 * Previously In This Book Card
 * 
 * Shows a summary of what happened in previous chapters
 * to help returning readers remember context.
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

interface PreviouslyInBookCardProps {
  bookId: string;
  currentChapter: number;
  bookTitle?: string;
}

interface ChapterSummary {
  chapterNumber: number;
  title: string;
  summary: string;
}

export function PreviouslyInBookCard({ 
  bookId, 
  currentChapter,
  bookTitle = "this book"
}: PreviouslyInBookCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [summaries, setSummaries] = useState<ChapterSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDismissed, setIsDismissed] = useState(false);

  // Don't show for chapter 1
  if (currentChapter <= 1) return null;

  useEffect(() => {
    const fetchPreviousChapters = async () => {
      setIsLoading(true);
      try {
        // Fetch previous 2-3 chapters for context
        const { data } = await supabase
          .from('chapters')
          .select('chapter_number, title, content')
          .eq('book_id', bookId)
          .lt('chapter_number', currentChapter)
          .order('chapter_number', { ascending: false })
          .limit(3);

        if (data && data.length > 0) {
          const chapterSummaries = data.reverse().map(chapter => ({
            chapterNumber: chapter.chapter_number,
            title: chapter.title,
            summary: extractSummary(chapter.content || '', 120),
          }));
          setSummaries(chapterSummaries);
        }
      } catch (err) {
        console.error('[PreviouslyInBook] Error fetching chapters:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPreviousChapters();
  }, [bookId, currentChapter]);

  // Extract a meaningful summary from chapter content
  const extractSummary = (content: string, maxLength: number): string => {
    // Remove markdown formatting
    let cleaned = content
      .replace(/#{1,6}\s*/g, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`[^`]+`/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
      .trim();

    // Get first meaningful sentences
    const sentences = cleaned.split(/(?<=[.!?])\s+/).filter(s => s.length > 20);
    let summary = '';
    
    for (const sentence of sentences.slice(0, 3)) {
      if ((summary + sentence).length > maxLength) break;
      summary += (summary ? ' ' : '') + sentence;
    }

    return summary || cleaned.slice(0, maxLength) + '...';
  };

  if (isLoading || summaries.length === 0 || isDismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="mb-6 rounded-lg border border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 overflow-hidden"
      >
        {/* Header - always visible */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between p-4 hover:bg-primary/5 transition-colors"
        >
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Previously in {bookTitle}</span>
            <Sparkles className="h-3 w-3 text-primary/60" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {summaries.length} chapter{summaries.length > 1 ? 's' : ''}
            </span>
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </button>

        {/* Expanded content */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 space-y-3">
                {summaries.map((chapter) => (
                  <div 
                    key={chapter.chapterNumber}
                    className="p-3 rounded-md bg-background/50 border border-border/30"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-primary">
                        Chapter {chapter.chapterNumber}
                      </span>
                      <span className="text-xs text-muted-foreground">•</span>
                      <span className="text-xs font-medium text-foreground/80 truncate">
                        {chapter.title}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {chapter.summary}
                    </p>
                  </div>
                ))}
                
                <div className="flex justify-end pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsDismissed(true);
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}
