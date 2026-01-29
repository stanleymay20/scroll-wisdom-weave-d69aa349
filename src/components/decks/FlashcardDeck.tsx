/**
 * Flashcard Deck Component
 * 
 * Interactive flashcard system for learning and memorization.
 * Supports flip animation, progress tracking, and spaced repetition hints.
 */

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Shuffle,
  X,
  Check,
  Brain,
  Loader2,
  Sparkles,
  GraduationCap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  category?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
}

export interface FlashcardDeck {
  id: string;
  title: string;
  description?: string;
  cards: Flashcard[];
  createdAt: string;
  sourceBookId?: string;
  sourceChapter?: number;
}

interface FlashcardDeckProps {
  deck: FlashcardDeck;
  onClose?: () => void;
  className?: string;
}

export function FlashcardViewer({ deck, onClose, className }: FlashcardDeckProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [knownCards, setKnownCards] = useState<Set<string>>(new Set());
  const [studyingCards, setStudyingCards] = useState<Set<string>>(new Set());
  const [shuffled, setShuffled] = useState(false);
  const [cardOrder, setCardOrder] = useState<number[]>([]);

  const totalCards = deck.cards.length;
  const currentCard = deck.cards[cardOrder[currentIndex] ?? currentIndex];

  // Initialize card order
  useEffect(() => {
    setCardOrder(Array.from({ length: totalCards }, (_, i) => i));
  }, [totalCards]);

  const goNext = useCallback(() => {
    if (currentIndex < totalCards - 1) {
      setCurrentIndex(currentIndex + 1);
      setIsFlipped(false);
    }
  }, [currentIndex, totalCards]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setIsFlipped(false);
    }
  }, [currentIndex]);

  const flipCard = useCallback(() => {
    setIsFlipped(!isFlipped);
  }, [isFlipped]);

  const markKnown = useCallback(() => {
    if (currentCard) {
      setKnownCards(prev => new Set(prev).add(currentCard.id));
      setStudyingCards(prev => {
        const next = new Set(prev);
        next.delete(currentCard.id);
        return next;
      });
    }
    goNext();
  }, [currentCard, goNext]);

  const markStudying = useCallback(() => {
    if (currentCard) {
      setStudyingCards(prev => new Set(prev).add(currentCard.id));
      setKnownCards(prev => {
        const next = new Set(prev);
        next.delete(currentCard.id);
        return next;
      });
    }
    goNext();
  }, [currentCard, goNext]);

  const shuffleCards = useCallback(() => {
    const newOrder = [...cardOrder].sort(() => Math.random() - 0.5);
    setCardOrder(newOrder);
    setCurrentIndex(0);
    setIsFlipped(false);
    setShuffled(true);
  }, [cardOrder]);

  const resetDeck = useCallback(() => {
    setCardOrder(Array.from({ length: totalCards }, (_, i) => i));
    setCurrentIndex(0);
    setIsFlipped(false);
    setKnownCards(new Set());
    setStudyingCards(new Set());
    setShuffled(false);
  }, [totalCards]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        flipCard();
      }
      if (e.key === 'Escape') onClose?.();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goNext, goPrev, flipCard, onClose]);

  if (!currentCard) return null;

  const progress = ((knownCards.size / totalCards) * 100);
  const isKnown = knownCards.has(currentCard.id);
  const isStudying = studyingCards.has(currentCard.id);

  return (
    <div className={cn(
      'flex flex-col bg-background rounded-xl border shadow-lg overflow-hidden',
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm truncate max-w-[200px]">{deck.title}</span>
          <Badge variant="outline" className="text-xs">
            {currentIndex + 1} / {totalCards}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={shuffleCards}
            className={cn(shuffled && 'text-primary')}
            title="Shuffle"
          >
            <Shuffle className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={resetDeck}
            title="Reset"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          {onClose && (
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Progress */}
      <div className="px-4 py-2 bg-muted/20">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span className="flex items-center gap-1">
            <Check className="h-3 w-3 text-primary" />
            Known: {knownCards.size}
          </span>
          <span className="flex items-center gap-1">
            <Brain className="h-3 w-3 text-muted-foreground" />
            Studying: {studyingCards.size}
          </span>
        </div>
        <Progress value={progress} className="h-1.5" />
      </div>

      {/* Flashcard */}
      <div className="flex-1 p-6 flex items-center justify-center min-h-[300px]">
        <motion.div
          className={cn(
            'relative w-full max-w-md aspect-[3/2] cursor-pointer perspective-1000',
            'transform-style-preserve-3d transition-transform duration-500'
          )}
          onClick={flipCard}
          style={{ transformStyle: 'preserve-3d' }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={isFlipped ? 'back' : 'front'}
              initial={{ rotateY: isFlipped ? -90 : 90, opacity: 0 }}
              animate={{ rotateY: 0, opacity: 1 }}
              exit={{ rotateY: isFlipped ? 90 : -90, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className={cn(
                'absolute inset-0 rounded-2xl p-6 flex flex-col items-center justify-center text-center',
                'shadow-lg border-2',
                isFlipped
                  ? 'bg-gradient-to-br from-primary/10 to-primary/5 border-primary/30'
                  : 'bg-gradient-to-br from-scroll-gold/10 to-muted/30 border-scroll-gold/30',
                isKnown && 'ring-2 ring-primary/50',
                isStudying && 'ring-2 ring-muted-foreground/50'
              )}
            >
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                {isFlipped ? 'Answer' : 'Question'}
              </span>
              <p className={cn(
                'text-lg font-medium leading-relaxed text-foreground'
              )}>
                {isFlipped ? currentCard.back : currentCard.front}
              </p>
              {currentCard.category && (
                <Badge variant="secondary" className="mt-4 text-xs">
                  {currentCard.category}
                </Badge>
              )}
              <p className="text-xs text-muted-foreground mt-4">
                Tap or press Space to flip
              </p>
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Navigation & Actions */}
      <div className="p-4 border-t bg-muted/30">
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={goPrev}
            disabled={currentIndex <= 0}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Prev
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={markStudying}
              className="border-muted-foreground/50 text-muted-foreground hover:bg-muted"
            >
              <Brain className="h-4 w-4 mr-1" />
              Still Learning
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={markKnown}
            >
              <Check className="h-4 w-4 mr-1" />
              Got it!
            </Button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={goNext}
            disabled={currentIndex >= totalCards - 1}
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}
