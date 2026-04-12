/**
 * ChapterHookScreen v2 — Emotional hook with progress context + book stats
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight, Clock, BookOpen, Zap, Trophy } from "lucide-react";
import { getChapterHook } from "@/lib/gamificationEngine";

interface ChapterHookScreenProps {
  chapterNumber: number;
  chapterTitle: string;
  wordCount: number;
  onStart: () => void;
  bookTitle?: string;
  totalChapters?: number;
  userLevel?: number;
}

export function ChapterHookScreen({ chapterNumber, chapterTitle, wordCount, onStart, bookTitle, totalChapters, userLevel }: ChapterHookScreenProps) {
  const [show, setShow] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  
  const storageKey = `scroll_hook_${chapterNumber}`;
  useEffect(() => {
    try {
      const val = sessionStorage.getItem(storageKey);
      if (val === 'dismissed') {
        setShow(false);
        setDismissed(true);
      }
    } catch { /* noop */ }
  }, [storageKey]);

  const handleStart = () => {
    setShow(false);
    setDismissed(true);
    try { sessionStorage.setItem(storageKey, 'dismissed'); } catch { /* noop */ }
    onStart();
  };

  const readingMinutes = Math.max(1, Math.round((wordCount || 500) / 250));
  const hookMessage = getChapterHook(chapterNumber);
  const chapterXP = 10 + (chapterNumber > 1 ? 50 : 0);
  const progressPercent = totalChapters ? Math.round(((chapterNumber - 1) / totalChapters) * 100) : 0;

  if (dismissed || !show) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-background/95 backdrop-blur-xl flex items-center justify-center p-6"
      >
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.1, type: "spring", stiffness: 300, damping: 25 }}
          className="max-w-md w-full text-center"
        >
          {/* Progress context */}
          {totalChapters && totalChapters > 1 && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "100%" }}
              transition={{ delay: 0.15 }}
              className="mb-6"
            >
              <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                <span>Book progress</span>
                <span>{progressPercent}%</span>
              </div>
              <div className="h-1 bg-muted rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPercent}%` }}
                  transition={{ delay: 0.3, duration: 0.8 }}
                  className="h-full bg-primary rounded-full"
                />
              </div>
            </motion.div>
          )}

          {/* Chapter badge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-5"
          >
            <BookOpen className="h-3.5 w-3.5" />
            Chapter {chapterNumber}{totalChapters ? ` of ${totalChapters}` : ''}
          </motion.div>

          {/* Hook message */}
          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-2xl md:text-3xl font-display font-bold text-foreground leading-tight mb-3"
          >
            {hookMessage}
          </motion.h2>

          {/* Chapter title */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-muted-foreground text-sm mb-6"
          >
            {chapterTitle}
          </motion.p>

          {/* Stats row */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="flex items-center justify-center gap-4 mb-8"
          >
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>{readingMinutes} min read</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-primary font-medium">
              <Zap className="h-4 w-4" />
              <span>+{chapterXP} XP</span>
            </div>
            {userLevel && (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Trophy className="h-4 w-4" />
                <span>Lv.{userLevel}</span>
              </div>
            )}
          </motion.div>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
          >
            <Button
              onClick={handleStart}
              size="lg"
              className="gap-2 px-8 text-base rounded-full shadow-lg shadow-primary/20"
            >
              Start Now <ArrowRight className="h-5 w-5" />
            </Button>
          </motion.div>

          {/* Skip option */}
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            onClick={handleStart}
            className="mt-4 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            Skip intro
          </motion.button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
