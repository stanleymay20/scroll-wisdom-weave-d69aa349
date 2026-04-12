/**
 * AICompanion v2 — Adaptive floating encouragement engine
 * Book-title aware, speed-aware, richer message pools, typing animation
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles, MessageCircle, Brain } from "lucide-react";

interface AICompanionProps {
  readingProgress: number;
  chapterNumber: number;
  sectionsCompleted: number;
  streakDays: number;
  bookTitle?: string;
  readingSpeedWpm?: number;
  isVisible?: boolean;
}

const POOLS: Record<string, string[]> = {
  start: [
    "Good start — take your time with this section.",
    "The first section sets the stage. You're on it. 💪",
    "Let's build from here, one idea at a time.",
  ],
  momentum: [
    "You're in a good flow — keep going!",
    "Nice focus. One more section?",
    "You're building real understanding right now.",
  ],
  deep: [
    "You've gone deep into this chapter. Stay with it.",
    "You're connecting ideas across sections — that's where understanding lives.",
    "The next section builds on what you've learned.",
  ],
  almostDone: [
    "You're almost there — just a bit more!",
    "So close to finishing this chapter. Keep going. 🏁",
    "Your future self will thank you for finishing.",
  ],
  streak: [
    "🔥 Your streak is making this a habit.",
    "Day after day — this is how understanding deepens.",
    "Consistency matters. You're showing up.",
  ],
  fast: [
    "⚡ You're reading fast — take a moment on key ideas.",
    "Good pace! Consider pausing on the next key concept.",
  ],
  bookAware: [
    "This chapter of \"{book}\" is building your foundation.",
    "You're making progress through \"{book}\".",
    "\"{book}\" gets richer from here.",
  ],
};

function getMessage(progress: number, streak: number, sections: number, bookTitle?: string, speed?: number): string {
  // Speed-aware messages
  if (speed && speed > 350 && progress > 30 && Math.random() < 0.3) {
    return POOLS.fast[Math.floor(Math.random() * POOLS.fast.length)];
  }
  // Book-aware messages (20% chance)
  if (bookTitle && Math.random() < 0.2) {
    const pool = POOLS.bookAware;
    return pool[Math.floor(Math.random() * pool.length)].replace('{book}', bookTitle);
  }
  // Context-based
  if (streak >= 3 && Math.random() < 0.4) {
    return POOLS.streak[Math.floor(Math.random() * POOLS.streak.length)];
  }
  if (progress >= 85) return POOLS.almostDone[Math.floor(Math.random() * POOLS.almostDone.length)];
  if (progress >= 50) return POOLS.deep[Math.floor(Math.random() * POOLS.deep.length)];
  if (progress >= 15 || sections >= 1) return POOLS.momentum[Math.floor(Math.random() * POOLS.momentum.length)];
  return POOLS.start[Math.floor(Math.random() * POOLS.start.length)];
}

export function AICompanion({ readingProgress, chapterNumber, sectionsCompleted, streakDays, bookTitle, readingSpeedWpm, isVisible = true }: AICompanionProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [displayedText, setDisplayedText] = useState("");
  const lastTriggerRef = useRef(0);
  const shownCountRef = useRef(0);
  const autoMinRef = useRef<ReturnType<typeof setTimeout>>();

  // Typing animation
  useEffect(() => {
    if (!message) { setDisplayedText(""); return; }
    let i = 0;
    setDisplayedText("");
    const interval = setInterval(() => {
      i++;
      setDisplayedText(message.slice(0, i));
      if (i >= message.length) clearInterval(interval);
    }, 18);
    return () => clearInterval(interval);
  }, [message]);

  // Show contextual message at milestones
  useEffect(() => {
    if (!isVisible || dismissed) return;
    
    const milestones = [8, 20, 40, 60, 80, 92];
    const hit = milestones.find(m => readingProgress >= m && lastTriggerRef.current < m);
    
    if (hit && shownCountRef.current < 4) {
      lastTriggerRef.current = hit;
      shownCountRef.current += 1;
      setMessage(getMessage(readingProgress, streakDays, sectionsCompleted, bookTitle, readingSpeedWpm));
      setMinimized(false);
      
      if (autoMinRef.current) clearTimeout(autoMinRef.current);
      autoMinRef.current = setTimeout(() => setMinimized(true), 7000);
    }
  }, [readingProgress, isVisible, dismissed, streakDays, sectionsCompleted, bookTitle, readingSpeedWpm]);

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
    if (autoMinRef.current) clearTimeout(autoMinRef.current);
  }, []);

  const handleExpand = useCallback(() => {
    if (minimized && message) {
      setMinimized(false);
      if (autoMinRef.current) clearTimeout(autoMinRef.current);
      autoMinRef.current = setTimeout(() => setMinimized(true), 7000);
    }
  }, [minimized, message]);

  if (!isVisible || dismissed || !message) return null;

  return (
    <div className="fixed bottom-24 right-4 z-50">
      <AnimatePresence mode="wait">
        {minimized ? (
          <motion.button
            key="min"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            whileHover={{ scale: 1.12 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleExpand}
            className="w-11 h-11 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 flex items-center justify-center"
          >
            <motion.div animate={{ rotate: [0, 10, -10, 0] }} transition={{ repeat: Infinity, duration: 3 }}>
              <Brain className="h-5 w-5" />
            </motion.div>
          </motion.button>
        ) : (
          <motion.div
            key="exp"
            initial={{ opacity: 0, y: 20, scale: 0.85 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="max-w-[270px] bg-card/95 backdrop-blur-xl border border-border/50 rounded-2xl shadow-2xl p-4"
          >
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-muted-foreground font-medium mb-1">ScrollAI</p>
                <p className="text-sm text-foreground/85 leading-relaxed">{displayedText}<span className="animate-pulse">|</span></p>
              </div>
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
