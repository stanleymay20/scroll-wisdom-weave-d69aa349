/**
 * SessionFocus — distraction-light focus block with countdown timer.
 * The CTA opens the user's resume chapter in a new tab so the timer keeps
 * running here while they read.
 */
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Timer, ExternalLink, Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

interface SessionFocusProps {
  bookId: string | null;
  bookTitle: string | null;
  resumeChapter: number;
  durationMinutes: number;
  onComplete: (focusMinutes: number) => void;
}

export function SessionFocus({
  bookId,
  bookTitle,
  resumeChapter,
  durationMinutes,
  onComplete,
}: SessionFocusProps) {
  const totalSec = durationMinutes * 60;
  const [secondsLeft, setSecondsLeft] = useState(totalSec);
  const [running, setRunning] = useState(true);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(t);
          onComplete(durationMinutes);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [running, durationMinutes, onComplete]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const elapsed = totalSec - secondsLeft;
  const elapsedMin = Math.round((elapsed / 60) * 10) / 10;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      <Card className="bg-gradient-to-br from-primary/5 via-card to-accent/5 border-primary/10">
        <CardContent className="p-6 space-y-5 text-center">
          <div className="flex items-center justify-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <Timer className="h-3.5 w-3.5" /> Focus block
          </div>

          <div className="font-mono text-5xl sm:text-6xl font-light tabular-nums text-foreground">
            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </div>

          <Progress value={(elapsed / totalSec) * 100} className="h-1.5" />

          {bookTitle && (
            <p className="text-sm text-muted-foreground">
              Continue <span className="text-foreground font-medium">{bookTitle}</span> · Chapter {resumeChapter}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-center gap-2">
            {bookId && (
              <Button asChild>
                <a href={`/read/${bookId}/${resumeChapter}`} target="_blank" rel="noreferrer" className="gap-2">
                  Open chapter <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            )}
            <Button variant="outline" onClick={() => setRunning((r) => !r)} className="gap-2">
              {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {running ? 'Pause' : 'Resume'}
            </Button>
            <Button variant="ghost" onClick={() => onComplete(elapsedMin)}>
              Skip ahead
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
