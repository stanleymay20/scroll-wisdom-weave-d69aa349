/**
 * StuckReaderRescue — Detects users stuck in chapter 1 / before section 2
 * Shows one calm rescue option.
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Headphones, BookOpen, Compass, ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackFunnelEvent } from "@/lib/readingFunnel";

interface StuckReaderRescueProps {
  chapterNumber: number;
  readingProgress: number;
  sectionsCompleted: number;
  bookId: string;
  isVisible?: boolean;
  onListenInstead?: () => void;
  onGuidedMode?: () => void;
  onContinue?: () => void;
}

const STUCK_KEY = 'scroll_stuck_visits';

function getStuckCount(bookId: string, chapter: number): number {
  try {
    const raw = localStorage.getItem(STUCK_KEY);
    const data: Record<string, number> = raw ? JSON.parse(raw) : {};
    return data[`${bookId}-${chapter}`] || 0;
  } catch { return 0; }
}

function incrementStuckCount(bookId: string, chapter: number) {
  try {
    const raw = localStorage.getItem(STUCK_KEY);
    const data: Record<string, number> = raw ? JSON.parse(raw) : {};
    data[`${bookId}-${chapter}`] = (data[`${bookId}-${chapter}`] || 0) + 1;
    localStorage.setItem(STUCK_KEY, JSON.stringify(data));
  } catch { /* noop */ }
}

export function StuckReaderRescue({
  chapterNumber, readingProgress, sectionsCompleted, bookId,
  isVisible = true, onListenInstead, onGuidedMode, onContinue,
}: StuckReaderRescueProps) {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isVisible || dismissed) return;
    // Only for chapter 1 or when stuck before section 2
    if (chapterNumber > 1 && sectionsCompleted >= 2) return;
    
    const visits = getStuckCount(bookId, chapterNumber);
    // Show rescue if user has visited this chapter 2+ times and progress < 25%
    if (visits >= 2 && readingProgress < 25) {
      const t = setTimeout(() => setShow(true), 3000);
      return () => clearTimeout(t);
    }
    // Track visit
    incrementStuckCount(bookId, chapterNumber);
  }, [bookId, chapterNumber, readingProgress, sectionsCompleted, isVisible, dismissed]);

  const handleRescue = (type: string) => {
    setShow(false);
    setDismissed(true);
    trackFunnelEvent('stuck_reader_rescue', { bookId, chapterNumber, rescueType: type });
    
    if (type === 'listen' && onListenInstead) onListenInstead();
    else if (type === 'guided' && onGuidedMode) onGuidedMode();
    else if (type === 'continue' && onContinue) onContinue();
  };

  if (!show || dismissed) return null;

  const options = [
    { type: 'listen', icon: Headphones, label: 'Listen instead', desc: 'Have this chapter read aloud' },
    { type: 'guided', icon: Compass, label: 'Guided mode', desc: 'Step-by-step reading path' },
    { type: 'continue', icon: ArrowRight, label: 'Continue where I stopped', desc: 'Jump back to your last position' },
  ];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 30 }}
        className="fixed bottom-28 left-4 right-4 z-50 max-w-sm mx-auto"
      >
        <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-xl">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold text-foreground">Need a different approach?</p>
            </div>
            <button onClick={() => { setShow(false); setDismissed(true); }} className="opacity-40 hover:opacity-100">
              <X className="h-4 w-4" />
            </button>
          </div>
          
          <p className="text-xs text-muted-foreground mb-4">
            Everyone reads differently. Try one of these:
          </p>
          
          <div className="space-y-2">
            {options.map(opt => (
              <Button
                key={opt.type}
                variant="ghost"
                size="sm"
                onClick={() => handleRescue(opt.type)}
                className="w-full justify-start gap-3 h-auto py-2.5 px-3 hover:bg-muted/50"
              >
                <opt.icon className="h-4 w-4 text-primary shrink-0" />
                <div className="text-left">
                  <p className="text-sm font-medium">{opt.label}</p>
                  <p className="text-[10px] text-muted-foreground">{opt.desc}</p>
                </div>
              </Button>
            ))}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
