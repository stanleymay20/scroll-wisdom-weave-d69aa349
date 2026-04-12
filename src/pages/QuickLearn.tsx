/**
 * QuickLearn — TikTok-style infinite scroll of key insights
 * Feeds curiosity → drives deeper reading
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  BookOpen, ArrowRight, Bookmark, BookmarkCheck, 
  Zap, ChevronLeft, Sparkles, RefreshCw 
} from "lucide-react";
import { useGamification } from "@/hooks/useGamification";
import { Navbar } from "@/components/layout/Navbar";

interface InsightCard {
  id: string;
  bookId: string;
  bookTitle: string;
  chapterNumber: number;
  chapterTitle: string;
  insight: string;
  category: string;
  coverUrl: string | null;
  saved: boolean;
}

function extractInsights(content: string): string[] {
  if (!content) return [];
  const lines = content.split('\n');
  const insights: string[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    // Extract key sentences: bold text, blockquotes, or short impactful lines
    if (trimmed.startsWith('> ')) {
      insights.push(trimmed.replace(/^>\s*/, '').replace(/\*\*/g, ''));
    } else if (trimmed.startsWith('**') && trimmed.endsWith('**') && trimmed.length < 200) {
      insights.push(trimmed.replace(/\*\*/g, ''));
    } else if (trimmed.length > 40 && trimmed.length < 180 && !trimmed.startsWith('#') && !trimmed.startsWith('-') && !trimmed.startsWith('|')) {
      // Short impactful sentences
      if (/[.!?]$/.test(trimmed) && !/^(Figure|Table|Note:|Source:)/i.test(trimmed)) {
        insights.push(trimmed.replace(/\*\*/g, ''));
      }
    }
  }
  
  return insights.slice(0, 5); // Max 5 per chapter
}

export default function QuickLearn() {
  const [cards, setCards] = useState<InsightCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const navigate = useNavigate();
  const gamification = useGamification();
  const containerRef = useRef<HTMLDivElement>(null);

  // Load insights from published books
  const loadInsights = useCallback(async () => {
    setLoading(true);
    try {
      const { data: books } = await supabase
        .from('books')
        .select('id, title, category, cover_image_url, total_chapters')
        .eq('is_published', true)
        .limit(10);
      
      if (!books?.length) { setLoading(false); return; }
      
      const allCards: InsightCard[] = [];
      
      for (const book of books.slice(0, 5)) {
        const { data: chapters } = await supabase
          .from('chapters')
          .select('chapter_number, title, content')
          .eq('book_id', book.id)
          .order('chapter_number')
          .limit(3);
        
        if (!chapters) continue;
        
        for (const ch of chapters) {
          const insights = extractInsights(ch.content || '');
          for (const insight of insights) {
            allCards.push({
              id: `${book.id}-${ch.chapter_number}-${allCards.length}`,
              bookId: book.id,
              bookTitle: book.title,
              chapterNumber: ch.chapter_number,
              chapterTitle: ch.title,
              insight,
              category: book.category || 'general',
              coverUrl: book.cover_image_url,
              saved: false,
            });
          }
        }
      }
      
      // Shuffle for variety
      const shuffled = allCards.sort(() => Math.random() - 0.5);
      setCards(shuffled);
    } catch (err) {
      console.error('[QuickLearn] Load error:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadInsights(); }, [loadInsights]);

  const toggleSave = (id: string) => {
    setSavedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const goToChapter = (card: InsightCard) => {
    navigate(`/read/${card.bookId}/${card.chapterNumber}`);
  };

  const currentCard = cards[currentIndex];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      
      {/* Header */}
      <div className="container mx-auto px-4 pt-20 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                Quick Learn
              </h1>
              <p className="text-xs text-muted-foreground">Swipe through key insights</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={loadInsights} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Card Stack */}
      <div 
        ref={containerRef}
        className="flex-1 container mx-auto px-4 flex items-center justify-center pb-24"
      >
        {loading ? (
          <div className="text-center space-y-3">
            <Sparkles className="h-8 w-8 text-primary/40 mx-auto animate-pulse" />
            <p className="text-sm text-muted-foreground">Loading insights...</p>
          </div>
        ) : cards.length === 0 ? (
          <div className="text-center space-y-3">
            <BookOpen className="h-8 w-8 text-muted-foreground/40 mx-auto" />
            <p className="text-sm text-muted-foreground">No published books with insights yet</p>
          </div>
        ) : currentCard ? (
          <AnimatePresence mode="wait">
            <motion.div
              key={currentCard.id}
              initial={{ opacity: 0, x: 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -60 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="w-full max-w-md"
            >
              <div className="bg-card border border-border/50 rounded-3xl shadow-2xl overflow-hidden">
                {/* Book context */}
                <div className="px-5 pt-5 pb-3 flex items-center gap-3">
                  {currentCard.coverUrl ? (
                    <img src={currentCard.coverUrl} alt="" className="w-10 h-14 rounded-lg object-cover shadow-sm" />
                  ) : (
                    <div className="w-10 h-14 rounded-lg bg-primary/10 flex items-center justify-center">
                      <BookOpen className="h-5 w-5 text-primary/50" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{currentCard.bookTitle}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      Ch. {currentCard.chapterNumber}: {currentCard.chapterTitle}
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-[10px] shrink-0">
                    {currentCard.category}
                  </Badge>
                </div>
                
                {/* Insight */}
                <div className="px-5 py-6">
                  <p className="text-lg font-medium text-foreground leading-relaxed">
                    "{currentCard.insight}"
                  </p>
                </div>
                
                {/* Actions */}
                <div className="px-5 pb-5 flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleSave(currentCard.id)}
                    className="gap-1.5 rounded-full"
                  >
                    {savedIds.has(currentCard.id) ? (
                      <BookmarkCheck className="h-4 w-4 text-primary" />
                    ) : (
                      <Bookmark className="h-4 w-4" />
                    )}
                    {savedIds.has(currentCard.id) ? 'Saved' : 'Save'}
                  </Button>
                  
                  <Button
                    size="sm"
                    onClick={() => goToChapter(currentCard)}
                    className="gap-1.5 rounded-full flex-1"
                  >
                    Read Full Chapter <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Navigation dots */}
              <div className="flex items-center justify-center gap-3 mt-6">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
                  disabled={currentIndex === 0}
                  className="text-xs"
                >
                  Previous
                </Button>
                <span className="text-xs text-muted-foreground">
                  {currentIndex + 1} / {cards.length}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (currentIndex < cards.length - 1) {
                      setCurrentIndex(currentIndex + 1);
                      gamification.completeSection();
                    }
                  }}
                  disabled={currentIndex >= cards.length - 1}
                  className="text-xs"
                >
                  Next
                </Button>
              </div>
            </motion.div>
          </AnimatePresence>
        ) : (
          <div className="text-center">
            <p className="text-sm text-muted-foreground">You've seen all insights! 🎉</p>
            <Button variant="outline" className="mt-3" onClick={() => { setCurrentIndex(0); loadInsights(); }}>
              Refresh
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
