/**
 * Flashcard Deck Component
 * 
 * Interactive flashcard system with active recall:
 * - Type your answer before revealing
 * - AI-powered answer comparison
 * - SRS quality grading (1-5)
 * - Session summary with certification integration
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Shuffle,
  X,
  Check,
  Brain,
  Sparkles,
  GraduationCap,
  Send,
  Eye,
  Award,
  TrendingUp,
  AlertTriangle,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
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

// Per-card result after grading
export interface CardResult {
  cardId: string;
  userAnswer: string;
  correctAnswer: string;
  quality: number; // 1-5 SRS quality
  skipped: boolean;
}

// Session summary
export interface FlashcardSessionResult {
  deckId: string;
  deckTitle: string;
  sourceBookId?: string;
  sourceChapter?: number;
  totalCards: number;
  results: CardResult[];
  averageQuality: number;
  masteryPercent: number; // % with quality >= 4
  timestamp: string;
}

interface FlashcardDeckProps {
  deck: FlashcardDeck;
  onClose?: () => void;
  onSessionComplete?: (result: FlashcardSessionResult) => void;
  className?: string;
}

// Quality labels for SRS grading
const QUALITY_LABELS = [
  { quality: 1, label: 'Wrong', emoji: '❌', color: 'bg-destructive/20 text-destructive border-destructive/40 hover:bg-destructive/30' },
  { quality: 2, label: 'Barely', emoji: '😰', color: 'bg-orange-500/20 text-orange-700 dark:text-orange-400 border-orange-500/40 hover:bg-orange-500/30' },
  { quality: 3, label: 'Okay', emoji: '🤔', color: 'bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/40 hover:bg-amber-500/30' },
  { quality: 4, label: 'Good', emoji: '✅', color: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/30' },
  { quality: 5, label: 'Perfect', emoji: '🌟', color: 'bg-primary/20 text-primary border-primary/40 hover:bg-primary/30' },
];

type CardPhase = 'answer' | 'reveal' | 'graded';

export function FlashcardViewer({ deck, onClose, onSessionComplete, className }: FlashcardDeckProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [phase, setPhase] = useState<CardPhase>('answer');
  const [userAnswer, setUserAnswer] = useState('');
  const [shuffled, setShuffled] = useState(false);
  const [cardOrder, setCardOrder] = useState<number[]>([]);
  const [results, setResults] = useState<Map<string, CardResult>>(new Map());
  const [showSummary, setShowSummary] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const totalCards = deck.cards.length;
  const currentCard = deck.cards[cardOrder[currentIndex] ?? currentIndex];

  // Initialize card order
  useEffect(() => {
    setCardOrder(Array.from({ length: totalCards }, (_, i) => i));
  }, [totalCards]);

  // Focus textarea when entering answer phase
  useEffect(() => {
    if (phase === 'answer') {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [phase, currentIndex]);

  const handleReveal = useCallback(() => {
    setPhase('reveal');
  }, []);

  const handleSkip = useCallback(() => {
    if (currentCard) {
      const result: CardResult = {
        cardId: currentCard.id,
        userAnswer: '',
        correctAnswer: currentCard.back,
        quality: 1,
        skipped: true,
      };
      setResults(prev => new Map(prev).set(currentCard.id, result));
    }
    setPhase('reveal');
  }, [currentCard]);

  const handleGrade = useCallback((quality: number) => {
    if (!currentCard) return;

    const result: CardResult = {
      cardId: currentCard.id,
      userAnswer,
      correctAnswer: currentCard.back,
      quality,
      skipped: false,
    };
    setResults(prev => new Map(prev).set(currentCard.id, result));
    setPhase('graded');

    // Auto-advance after grading
    setTimeout(() => {
      if (currentIndex < totalCards - 1) {
        setCurrentIndex(currentIndex + 1);
        setUserAnswer('');
        setPhase('answer');
      } else {
        setShowSummary(true);
      }
    }, 400);
  }, [currentCard, userAnswer, currentIndex, totalCards]);

  const goTo = useCallback((index: number) => {
    if (index >= 0 && index < totalCards) {
      setCurrentIndex(index);
      const card = deck.cards[cardOrder[index] ?? index];
      const existing = card ? results.get(card.id) : null;
      if (existing) {
        setUserAnswer(existing.userAnswer);
        setPhase('graded');
      } else {
        setUserAnswer('');
        setPhase('answer');
      }
    }
  }, [totalCards, deck.cards, cardOrder, results]);

  const shuffleCards = useCallback(() => {
    const newOrder = [...cardOrder].sort(() => Math.random() - 0.5);
    setCardOrder(newOrder);
    setCurrentIndex(0);
    setUserAnswer('');
    setPhase('answer');
    setResults(new Map());
    setShuffled(true);
  }, [cardOrder]);

  const resetDeck = useCallback(() => {
    setCardOrder(Array.from({ length: totalCards }, (_, i) => i));
    setCurrentIndex(0);
    setUserAnswer('');
    setPhase('answer');
    setResults(new Map());
    setShuffled(false);
    setShowSummary(false);
  }, [totalCards]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Build session result
  const buildSessionResult = useCallback((): FlashcardSessionResult => {
    const allResults = Array.from(results.values());
    const avgQuality = allResults.length > 0
      ? allResults.reduce((s, r) => s + r.quality, 0) / allResults.length
      : 0;
    const masteryCount = allResults.filter(r => r.quality >= 4).length;

    return {
      deckId: deck.id,
      deckTitle: deck.title,
      sourceBookId: deck.sourceBookId,
      sourceChapter: deck.sourceChapter,
      totalCards,
      results: allResults,
      averageQuality: Math.round(avgQuality * 100) / 100,
      masteryPercent: totalCards > 0 ? Math.round((masteryCount / totalCards) * 100) : 0,
      timestamp: new Date().toISOString(),
    };
  }, [results, deck, totalCards]);

  // === SUMMARY VIEW ===
  if (showSummary) {
    const session = buildSessionResult();
    const allResults = Array.from(results.values());
    const qualityCounts = [0, 0, 0, 0, 0];
    allResults.forEach(r => { qualityCounts[r.quality - 1]++; });

    return (
      <div className={cn('flex flex-col bg-background rounded-xl border shadow-lg overflow-hidden', className)}>
        <div className="flex items-center justify-between p-4 border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <Award className="h-5 w-5 text-primary" />
            <span className="font-semibold">Session Complete</span>
          </div>
          {onClose && (
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Score Overview */}
          <div className="text-center space-y-2">
            <div className={cn(
              'inline-flex items-center justify-center w-20 h-20 rounded-full text-2xl font-bold',
              session.masteryPercent >= 80 ? 'bg-primary/20 text-primary' :
              session.masteryPercent >= 50 ? 'bg-amber-500/20 text-amber-600' :
              'bg-destructive/20 text-destructive'
            )}>
              {session.masteryPercent}%
            </div>
            <p className="text-sm text-muted-foreground">
              Mastery Score ({allResults.filter(r => r.quality >= 4).length}/{totalCards} cards mastered)
            </p>
            <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
              <TrendingUp className="h-3 w-3" />
              Avg Quality: {session.averageQuality}/5
            </div>
          </div>

          {/* Quality Distribution */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Grade Distribution</p>
            <div className="grid grid-cols-5 gap-1.5">
              {QUALITY_LABELS.map((q, i) => (
                <div key={q.quality} className={cn(
                  'text-center p-2 rounded-lg border',
                  qualityCounts[i] > 0 ? q.color : 'bg-muted/30 text-muted-foreground border-border/50'
                )}>
                  <span className="text-lg">{q.emoji}</span>
                  <p className="text-xs font-medium mt-0.5">{qualityCounts[i]}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Weak Cards */}
          {allResults.filter(r => r.quality <= 2).length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                Cards to Review
              </p>
              <div className="space-y-1.5">
                {allResults.filter(r => r.quality <= 2).map(r => {
                  const card = deck.cards.find(c => c.id === r.cardId);
                  return card ? (
                    <div key={r.cardId} className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm">
                      <p className="font-medium text-foreground">{card.front}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">→ {card.back}</p>
                    </div>
                  ) : null;
                })}
              </div>
            </div>
          )}

          {/* Certification notice */}
          {session.masteryPercent >= 70 && (
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/30 flex items-start gap-2">
              <GraduationCap className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-primary">Added to Certification</p>
                <p className="text-xs text-muted-foreground">
                  This session contributes to your mastery profile and certification progress.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-4 border-t bg-muted/30 flex gap-2">
          <Button variant="outline" className="flex-1 gap-2" onClick={resetDeck}>
            <RotateCcw className="h-4 w-4" />
            Study Again
          </Button>
          <Button
            variant="default"
            className="flex-1 gap-2"
            onClick={() => {
              onSessionComplete?.(session);
              onClose?.();
            }}
          >
            <Check className="h-4 w-4" />
            Done
          </Button>
        </div>
      </div>
    );
  }

  // === MAIN CARD VIEW ===
  if (!currentCard) return null;

  const answeredCount = results.size;
  const progressPercent = (answeredCount / totalCards) * 100;
  const existingResult = results.get(currentCard.id);

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
          <Button variant="ghost" size="icon" onClick={shuffleCards}
            className={cn(shuffled && 'text-primary')} title="Shuffle">
            <Shuffle className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={resetDeck} title="Reset">
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
            <Brain className="h-3 w-3" />
            Answered: {answeredCount}/{totalCards}
          </span>
          {answeredCount > 0 && (
            <span className="flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-primary" />
              Mastered: {Array.from(results.values()).filter(r => r.quality >= 4).length}
            </span>
          )}
        </div>
        <Progress value={progressPercent} className="h-1.5" />
      </div>

      {/* Card Content */}
      <div className="flex-1 p-4 space-y-4 overflow-y-auto min-h-[320px]">
        {/* Question */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-scroll-gold/10 to-muted/30 border border-scroll-gold/20">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Question</span>
          <p className="text-base font-medium mt-1 text-foreground leading-relaxed">{currentCard.front}</p>
          {currentCard.category && (
            <Badge variant="secondary" className="mt-2 text-xs">{currentCard.category}</Badge>
          )}
        </div>

        {/* Answer Input Phase */}
        {phase === 'answer' && !existingResult && (
          <div className="space-y-3">
            <Textarea
              ref={textareaRef}
              value={userAnswer}
              onChange={(e) => setUserAnswer(e.target.value)}
              placeholder="Type your answer here..."
              className="min-h-[80px] resize-none text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  handleReveal();
                }
              }}
            />
            <div className="flex gap-2">
              <Button variant="default" className="flex-1 gap-2" onClick={handleReveal}
                disabled={!userAnswer.trim()}>
                <Eye className="h-4 w-4" />
                Reveal Answer
              </Button>
              <Button variant="ghost" size="sm" onClick={handleSkip} className="text-muted-foreground">
                Skip
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground text-center">⌘+Enter to reveal</p>
          </div>
        )}

        {/* Reveal Phase — show correct answer + grade buttons */}
        {(phase === 'reveal' || (phase === 'answer' && existingResult)) && (
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              {/* User's answer */}
              {(userAnswer.trim() || existingResult?.userAnswer) && (
                <div className="p-3 rounded-lg bg-muted/50 border border-border/50">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Your Answer</span>
                  <p className="text-sm mt-0.5 text-foreground">
                    {existingResult?.userAnswer || userAnswer}
                  </p>
                </div>
              )}

              {/* Correct answer */}
              <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
                <span className="text-[10px] uppercase tracking-wider text-primary">Correct Answer</span>
                <p className="text-sm mt-0.5 text-foreground font-medium">{currentCard.back}</p>
              </div>

              {/* Grade buttons — only show if not yet graded */}
              {!existingResult && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground text-center font-medium">
                    How well did you know this?
                  </p>
                  <div className="grid grid-cols-5 gap-1.5">
                    {QUALITY_LABELS.map((q) => (
                      <button
                        key={q.quality}
                        onClick={() => handleGrade(q.quality)}
                        className={cn(
                          'flex flex-col items-center gap-0.5 p-2 rounded-lg border transition-all',
                          q.color
                        )}
                      >
                        <span className="text-base">{q.emoji}</span>
                        <span className="text-[10px] font-medium">{q.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Already graded indicator */}
              {existingResult && (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <span>Graded:</span>
                  <Badge variant="outline" className="text-xs">
                    {QUALITY_LABELS[existingResult.quality - 1]?.emoji}{' '}
                    {QUALITY_LABELS[existingResult.quality - 1]?.label}
                  </Badge>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {/* Navigation */}
      <div className="p-3 border-t bg-muted/30 flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={() => goTo(currentIndex - 1)}
          disabled={currentIndex <= 0}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Prev
        </Button>

        {/* Card dots */}
        <div className="flex items-center gap-0.5 max-w-[200px] overflow-hidden">
          {deck.cards.slice(0, Math.min(totalCards, 20)).map((c, i) => {
            const r = results.get(deck.cards[cardOrder[i] ?? i]?.id);
            return (
              <button
                key={i}
                onClick={() => goTo(i)}
                className={cn(
                  'w-2 h-2 rounded-full transition-all shrink-0',
                  i === currentIndex ? 'w-4 bg-primary' :
                  r && r.quality >= 4 ? 'bg-emerald-500' :
                  r && r.quality >= 3 ? 'bg-amber-500' :
                  r ? 'bg-destructive/70' :
                  'bg-muted-foreground/30'
                )}
              />
            );
          })}
          {totalCards > 20 && <span className="text-[9px] text-muted-foreground ml-1">+{totalCards - 20}</span>}
        </div>

        {currentIndex < totalCards - 1 ? (
          <Button variant="outline" size="sm" onClick={() => goTo(currentIndex + 1)}>
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button variant="default" size="sm" onClick={() => setShowSummary(true)}
            className="gap-1">
            <Award className="h-4 w-4" />
            Finish
          </Button>
        )}
      </div>
    </div>
  );
}
