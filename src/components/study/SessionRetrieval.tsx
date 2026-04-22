/**
 * SessionRetrieval — short retrieval block targeting the user's weakest concepts.
 * Lightweight self-graded format ("got it" / "shaky" / "missed it") to avoid
 * extra AI calls. Mastery scoring is handled by the broader quiz engine elsewhere.
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Target, Check, AlertCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

interface SessionRetrievalProps {
  weakConcepts: Array<{ id: string; label: string; mastery: number }>;
  onComplete: (result: { score: number; conceptsTouched: number }) => void;
}

const PROMPTS = [
  (label: string) => `In one sentence, define **${label}** in your own words.`,
  (label: string) => `Give one concrete example of **${label}** and explain why it fits.`,
  (label: string) => `When would **${label}** *not* apply? Name a counter-case.`,
];

export function SessionRetrieval({ weakConcepts, onComplete }: SessionRetrievalProps) {
  // Pad to at least 3 prompts even if weakConcepts is short
  const queue = weakConcepts.length > 0
    ? weakConcepts
    : [{ id: 'gen-1', label: 'a key idea from this book', mastery: 0 }];

  const [index, setIndex] = useState(0);
  const [scores, setScores] = useState<number[]>([]);

  const total = Math.min(3, queue.length);
  const current = queue[index % queue.length];
  const prompt = PROMPTS[index % PROMPTS.length](current.label);

  const grade = (score: number) => {
    const next = [...scores, score];
    if (index + 1 >= total) {
      const avg = next.reduce((a, b) => a + b, 0) / next.length;
      onComplete({ score: avg, conceptsTouched: next.length });
    } else {
      setScores(next);
      setIndex(index + 1);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <Target className="h-3.5 w-3.5" /> Retrieval · {index + 1} / {total}
        </div>
        <Progress value={(index / total) * 100} className="h-1 w-32" />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={`${current.id}-${index}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        >
          <Card className="bg-card border-primary/10">
            <CardContent className="p-6 space-y-5 min-h-[180px] flex flex-col justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                  Weak concept · mastery {Math.round((current.mastery || 0) * 100)}%
                </div>
                <p
                  className="text-base sm:text-lg text-foreground leading-relaxed"
                  dangerouslySetInnerHTML={{
                    __html: prompt.replace(/\*\*(.*?)\*\*/g, '<strong class="text-primary">$1</strong>'),
                  }}
                />
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-2">
                  Think it through silently or out loud, then rate yourself:
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => grade(0.2)} className="gap-1.5">
                    <X className="h-3.5 w-3.5" /> Missed it
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => grade(0.6)} className="gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5" /> Shaky
                  </Button>
                  <Button size="sm" onClick={() => grade(1)} className="gap-1.5">
                    <Check className="h-3.5 w-3.5" /> Got it
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
