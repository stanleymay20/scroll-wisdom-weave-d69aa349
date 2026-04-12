/**
 * AICompanion — Floating contextual encouragement during reading
 * Context-aware, non-intrusive retention anchor
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles, MessageCircle } from "lucide-react";

interface AICompanionProps {
  readingProgress: number;
  chapterNumber: number;
  sectionsCompleted: number;
  streakDays: number;
  isVisible?: boolean;
}

const ENCOURAGEMENT_POOLS: Record<string, string[]> = {
  start: [
    "You're off to a great start — let's build momentum!",
    "Most people never start. You already have. 💪",
    "The first section is always the hardest. You got this.",
  ],
  momentum: [
    "You're in the flow now — keep going!",
    "Most readers stop here. Not you. 🔥",
    "Your focus is impressive. One more section?",
    "You're building real understanding right now.",
  ],
  deep: [
    "You've gone deeper than 85% of readers. Incredible.",
    "This is where the real insights live. Stay with it.",
    "You're connecting ideas across sections — that's mastery.",
    "Want a deeper insight? The next section reveals the pattern.",
  ],
  almostDone: [
    "You're almost there — just one more push!",
    "The finish line is in sight. Don't stop now. 🏁",
    "Complete this chapter and you'll remember it forever.",
  ],
  streak: [
    "🔥 Your streak is making this a habit. Beautiful.",
    "Consistent readers retain 3x more. You're proving it.",
    "Day after day — this is how mastery works.",
  ],
};

function getContextualMessage(progress: number, streak: number, sectionsCompleted: number): string {
  if (streak >= 3) {
    const pool = ENCOURAGEMENT_POOLS.streak;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  if (progress >= 85) {
    const pool = ENCOURAGEMENT_POOLS.almostDone;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  if (progress >= 50) {
    const pool = ENCOURAGEMENT_POOLS.deep;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  if (progress >= 15 || sectionsCompleted >= 1) {
    const pool = ENCOURAGEMENT_POOLS.momentum;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  const pool = ENCOURAGEMENT_POOLS.start;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function AICompanion({ readingProgress, chapterNumber, sectionsCompleted, streakDays, isVisible = true }: AICompanionProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const lastTriggerRef = useRef(0);
  const shownCountRef = useRef(0);

  // Show contextual message at key progress milestones
  useEffect(() => {
    if (!isVisible || dismissed) return;
    
    const milestones = [10, 25, 50, 75, 90];
    const currentMilestone = milestones.find(m => 
      readingProgress >= m && lastTriggerRef.current < m
    );
    
    if (currentMilestone && shownCountRef.current < 3) {
      lastTriggerRef.current = currentMilestone;
      shownCountRef.current += 1;
      const msg = getContextualMessage(readingProgress, streakDays, sectionsCompleted);
      setMessage(msg);
      setMinimized(false);
      
      // Auto-minimize after 6s
      const t = setTimeout(() => setMinimized(true), 6000);
      return () => clearTimeout(t);
    }
  }, [readingProgress, isVisible, dismissed, streakDays, sectionsCompleted]);

  // Reset on chapter change
  useEffect(() => {
    lastTriggerRef.current = 0;
    shownCountRef.current = 0;
    setDismissed(false);
    setMessage(null);
    setMinimized(false);
  }, [chapterNumber]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    setMessage(null);
  }, []);

  const handleExpand = useCallback(() => {
    if (minimized && message) {
      setMinimized(false);
      const t = setTimeout(() => setMinimized(true), 6000);
      return () => clearTimeout(t);
    }
  }, [minimized, message]);

  if (!isVisible || dismissed || !message) return null;

  return (
    <div className="fixed bottom-24 right-4 z-50">
      <AnimatePresence mode="wait">
        {minimized ? (
          <motion.button
            key="minimized"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            onClick={handleExpand}
            className="w-11 h-11 rounded-full bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 flex items-center justify-center hover:scale-110 transition-transform"
          >
            <MessageCircle className="h-5 w-5" />
          </motion.button>
        ) : (
          <motion.div
            key="expanded"
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="max-w-[260px] bg-card/95 backdrop-blur-md border border-border/50 rounded-2xl shadow-xl p-3.5"
          >
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
              </div>
              <p className="text-sm text-foreground/85 leading-relaxed flex-1">{message}</p>
              <button onClick={handleDismiss} className="opacity-40 hover:opacity-100 shrink-0 mt-0.5">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
