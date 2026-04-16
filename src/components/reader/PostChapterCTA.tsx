/**
 * PHASE 2 — Post-Chapter Learning Loop CTA
 *
 * Soft prompt shown when reading progress hits ~95%.
 * Activates the dormant Read → Test → Reinforce loop.
 *
 * Pedagogy: makes the next learning action visible and one-tap away.
 * - Test mastery (QuizMode)
 * - Save flashcards (SRS)
 * - Continue to next chapter
 */

import { motion } from "framer-motion";
import { Brain, Layers, ArrowRight, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface PostChapterCTAProps {
  chapterTitle: string;
  chapterNumber: number;
  totalChapters: number;
  onTakeQuiz: () => void;
  onCreateFlashcards: () => void;
  onContinue: () => void;
  className?: string;
}

export function PostChapterCTA({
  chapterTitle,
  chapterNumber,
  totalChapters,
  onTakeQuiz,
  onCreateFlashcards,
  onContinue,
  className,
}: PostChapterCTAProps) {
  const [dismissed, setDismissed] = useState(false);
  const isLastChapter = chapterNumber >= totalChapters;

  if (dismissed) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 280, damping: 26 }}
      className={cn("my-8", className)}
    >
      <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 via-background to-accent/5">
        <button
          onClick={() => setDismissed(true)}
          className="absolute top-3 right-3 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>

        <CardContent className="p-6 sm:p-8">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-8 w-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            </div>
            <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
              Chapter {chapterNumber} complete
            </span>
          </div>

          <h3 className="text-xl sm:text-2xl font-semibold text-foreground mb-2">
            Lock in what you just learned
          </h3>
          <p className="text-sm sm:text-base text-muted-foreground mb-6 max-w-prose">
            Reading creates exposure. Testing creates mastery. Choose how you want to
            reinforce <span className="font-medium text-foreground">{chapterTitle}</span> before moving on.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            {/* Primary action: Quiz */}
            <Button
              size="lg"
              onClick={onTakeQuiz}
              className="h-auto py-4 px-5 flex flex-col items-start gap-1 text-left bg-primary hover:bg-primary/90"
            >
              <div className="flex items-center gap-2 w-full">
                <Brain className="h-5 w-5 shrink-0" />
                <span className="font-semibold">Test your mastery</span>
                <ArrowRight className="h-4 w-4 ml-auto" />
              </div>
              <span className="text-xs font-normal opacity-90">
                3-5 questions • Earn certification credit
              </span>
            </Button>

            {/* Secondary: Flashcards */}
            <Button
              size="lg"
              variant="outline"
              onClick={onCreateFlashcards}
              className="h-auto py-4 px-5 flex flex-col items-start gap-1 text-left border-primary/30 hover:bg-primary/5"
            >
              <div className="flex items-center gap-2 w-full">
                <Layers className="h-5 w-5 shrink-0 text-primary" />
                <span className="font-semibold">Create flashcards</span>
                <ArrowRight className="h-4 w-4 ml-auto opacity-60" />
              </div>
              <span className="text-xs font-normal text-muted-foreground">
                Spaced repetition • Review later
              </span>
            </Button>
          </div>

          {/* Tertiary: skip ahead */}
          <button
            onClick={onContinue}
            className="mt-4 text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
          >
            {isLastChapter ? "Finish book" : "Continue to next chapter"}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </CardContent>
      </Card>
    </motion.div>
  );
}
