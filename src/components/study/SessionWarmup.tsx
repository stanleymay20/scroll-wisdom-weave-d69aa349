/**
 * SessionWarmup — 3 SRS cards as a quick recall warm-up.
 * Reuses existing useSpacedRepetition hook for review semantics.
 */
import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useSpacedRepetition } from '@/hooks/useSpacedRepetition';
import type { ReviewQuality } from '@/lib/spacedRepetition';

interface SessionWarmupProps {
  userId: string;
  bookId: string | null;
  targetCount: number;
  onComplete: (cardsReviewed: number) => void;
}

const EASE: [string, ReviewQuality][] = [
  ['Forgot', 1],
  ['Hard', 2],
  ['Good', 4],
  ['Easy', 5],
];

export function SessionWarmup({ userId, bookId, targetCount, onComplete }: SessionWarmupProps) {
  const { dueCards, reviewCard, isLoading } = useSpacedRepetition({ userId, bookId: bookId || undefined });
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [reviewed, setReviewed] = useState(0);

  const queue = useMemo(() => dueCards.slice(0, Math.max(targetCount, 1)), [dueCards, targetCount]);
  const current = queue[index];
  const total = queue.length || targetCount;

  useEffect(() => {
    if (!isLoading && queue.length === 0) onComplete(0);
  }, [isLoading, queue.length, onComplete]);

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading warm-up cards…</div>;
  }

  if (!current) return null;

  const handleGrade = async (quality: ReviewQuality) => {
    await reviewCard(current.id, quality);
    const next = reviewed + 1;
    setReviewed(next);
    setRevealed(false);
    if (index + 1 >= queue.length) {
      onComplete(next);
    } else {
      setIndex(index + 1);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <Brain className="h-3.5 w-3.5" /> Warm-up · {index + 1} / {total}
        </div>
        <Progress value={((index) / total) * 100} className="h-1 w-32" />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={current.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        >
          <Card className="bg-card border-primary/10">
            <CardContent className="p-6 space-y-4 min-h-[180px] flex flex-col justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                  {current.bloomLevel}
                </div>
                <p className="text-base sm:text-lg text-foreground leading-relaxed">{current.question}</p>
              </div>

              {revealed ? (
                <div className="space-y-3">
                  <div className="rounded-md bg-primary/5 border border-primary/10 p-3 text-sm text-foreground">
                    {current.answer}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {EASE.map(([label, q]) => (
                      <Button
                        key={label}
                        size="sm"
                        variant={q >= 3 ? 'default' : 'outline'}
                        onClick={() => handleGrade(q)}
                        className="gap-1.5"
                      >
                        {q >= 3 ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : (
                <Button onClick={() => setRevealed(true)} className="self-start">
                  Reveal answer
                </Button>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
