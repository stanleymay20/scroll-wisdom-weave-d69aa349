/**
 * QuickLearn v2 — TikTok-style insight feed with swipe, keyboard nav, touch feedback
 * Batch-loaded, gesture-enabled, haptic-ready
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, PanInfo } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { trackFunnelEvent } from "@/lib/readingFunnel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  BookOpen, ArrowRight, Bookmark, BookmarkCheck, 
  Zap, ChevronLeft, Sparkles, RefreshCw, Share2 
} from "lucide-react";
import { useGamification } from "@/hooks/useGamification";
import { Navbar } from "@/components/layout/Navbar";
import { Progress } from "@/components/ui/progress";

interface InsightCard {
  id: string;
  bookId: string;
  bookTitle: string;
  chapterNumber: number;
  chapterTitle: string;
  insight: string;
  category: string;
  coverUrl: string | null;
}

function extractInsights(content: string): string[] {
  if (!content) return [];
  const lines = content.split('\n');
  const insights: string[] = [];
  const seen = new Set<string>();
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 30) continue;
    
    // Blockquotes
    if (trimmed.startsWith('> ')) {
      const clean = trimmed.replace(/^>\s*/, '').replace(/\*\*/g, '').trim();
      if (clean.length > 30 && clean.length < 200 && !seen.has(clean)) {
        seen.add(clean); insights.push(clean);
      }
      continue;
    }
    // Bold statements
    if (trimmed.startsWith('**') && trimmed.endsWith('**') && trimmed.length < 200) {
      const clean = trimmed.replace(/\*\*/g, '').trim();
      if (!seen.has(clean)) { seen.add(clean); insights.push(clean); }
      continue;
    }
    // Quality sentences (not headers, lists, tables, figures)
    if (trimmed.length >= 50 && trimmed.length <= 180 
      && /[.!?]$/.test(trimmed) 
      && !/^[#\-|*]/.test(trimmed)
      && !/^(Figure|Table|Note:|Source:|Image|Example:)/i.test(trimmed)) {
      const clean = trimmed.replace(/\*\*/g, '').trim();
      if (!seen.has(clean)) { seen.add(clean); insights.push(clean); }
    }
  }
  
  return insights.slice(0, 5);
}

export default function QuickLearn() {
  const [cards, setCards] = useState<InsightCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [direction, setDirection] = useState(0); // -1 prev, 1 next
  const navigate = useNavigate();
  const gamification = useGamification();

  // Batch load insights (single query for books + chapters)
  const loadInsights = useCallback(async () => {
    setLoading(true);
    try {
      const { data: books } = await supabase
        .from('books')
        .select('id, title, category, cover_image_url')
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .limit(8);
      
      if (!books?.length) { setLoading(false); return; }
      
      const bookIds = books.map(b => b.id);
      const { data: chapters } = await supabase
        .from('chapters')
        .select('book_id, chapter_number, title, content')
        .in('book_id', bookIds)
        .order('chapter_number')
        .limit(30);
      
      if (!chapters?.length) { setLoading(false); return; }
      
      const bookMap = new Map(books.map(b => [b.id, b]));
      const allCards: InsightCard[] = [];
      
      for (const ch of chapters) {
        const book = bookMap.get(ch.book_id);
        if (!book) continue;
        
        for (const insight of extractInsights(ch.content || '')) {
          allCards.push({
            id: `${ch.book_id}-${ch.chapter_number}-${allCards.length}`,
            bookId: ch.book_id,
            bookTitle: book.title,
            chapterNumber: ch.chapter_number,
            chapterTitle: ch.title,
            insight,
            category: book.category || 'general',
            coverUrl: book.cover_image_url,
          });
        }
      }
      
      // Fisher-Yates shuffle
      for (let i = allCards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allCards[i], allCards[j]] = [allCards[j], allCards[i]];
      }
      
      setCards(allCards);
      setCurrentIndex(0);
    } catch (err) {
      console.error('[QuickLearn] Load error:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadInsights(); }, [loadInsights]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goNext();
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') goPrev();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  const goNext = () => {
    if (currentIndex < cards.length - 1) {
      setDirection(1);
      setCurrentIndex(i => i + 1);
      gamification.completeSection();
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) {
      setDirection(-1);
      setCurrentIndex(i => i - 1);
    }
  };

  // Swipe gesture handler
  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const threshold = 80;
    if (info.offset.x < -threshold) goNext();
    else if (info.offset.x > threshold) goPrev();
  };

  const toggleSave = (id: string) => {
    setSavedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const currentCard = cards[currentIndex];
  const progressPercent = cards.length > 0 ? Math.round(((currentIndex + 1) / cards.length) * 100) : 0;

  const slideVariants = {
    enter: (d: number) => ({ x: d > 0 ? 300 : -300, opacity: 0, scale: 0.9 }),
    center: { x: 0, opacity: 1, scale: 1 },
    exit: (d: number) => ({ x: d > 0 ? -300 : 300, opacity: 0, scale: 0.9 }),
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      
      <div className="container mx-auto px-4 pt-20 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Go back">
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </Button>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" aria-hidden="true" />
                Quick Learn
              </h1>
              <p className="text-xs text-muted-foreground">Swipe through key insights · {cards.length} cards</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={loadInsights} disabled={loading} aria-label="Refresh insights">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          </Button>
        </div>

        {/* Progress bar */}
        {cards.length > 0 && (
          <div className="mt-3">
            <Progress value={progressPercent} className="h-1" />
          </div>
        )}
      </div>

      {/* Card area */}
      <div className="flex-1 container mx-auto px-4 flex items-center justify-center pb-24 overflow-hidden">
        {loading ? (
          <div className="text-center space-y-3">
            <Sparkles className="h-8 w-8 text-primary/40 mx-auto animate-pulse" />
            <p className="text-sm text-muted-foreground">Curating insights...</p>
          </div>
        ) : cards.length === 0 ? (
          <div className="text-center space-y-3">
            <BookOpen className="h-8 w-8 text-muted-foreground/40 mx-auto" />
            <p className="text-sm text-muted-foreground">No published books with insights yet</p>
            <Button variant="outline" size="sm" onClick={() => navigate('/explore')}>Browse Books</Button>
          </div>
        ) : currentCard ? (
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={currentCard.id}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: "spring", stiffness: 350, damping: 30 }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.15}
              onDragEnd={handleDragEnd}
              className="w-full max-w-md cursor-grab active:cursor-grabbing touch-pan-y"
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
                <div className="px-5 py-8">
                  <p className="text-lg font-medium text-foreground leading-relaxed text-center">
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
                    onClick={() => {
                      trackFunnelEvent('quicklearn_to_reader_click', {
                        bookId: currentCard.bookId,
                        chapterNumber: currentCard.chapterNumber,
                        sourceCard: currentCard.id,
                      });
                      navigate(`/read/${currentCard.bookId}/${currentCard.chapterNumber}`);
                    }}
                    className="gap-1.5 rounded-full flex-1"
                  >
                    Read Full Chapter <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Navigation */}
              <div className="flex items-center justify-between mt-5 px-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={goPrev}
                  disabled={currentIndex === 0}
                  className="text-xs gap-1"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Prev
                </Button>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {currentIndex + 1} / {cards.length}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={goNext}
                  disabled={currentIndex >= cards.length - 1}
                  className="text-xs gap-1"
                >
                  Next <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>

              <p className="text-center text-[10px] text-muted-foreground/50 mt-2">
                Swipe or use arrow keys
              </p>
            </motion.div>
          </AnimatePresence>
        ) : null}
      </div>
    </div>
  );
}
