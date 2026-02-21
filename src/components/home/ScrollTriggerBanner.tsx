/**
 * Sticky bottom banner — triggered at 40% scroll if user hasn't interacted with demo
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Brain, X } from "lucide-react";

interface ScrollTriggerBannerProps {
  onStartDemo: () => void;
  demoCompleted: boolean;
}

export function ScrollTriggerBanner({ onStartDemo, demoCompleted }: ScrollTriggerBannerProps) {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (demoCompleted || dismissed) return;

    const handleScroll = () => {
      const scrollPercent = window.scrollY / (document.documentElement.scrollHeight - window.innerHeight);
      if (scrollPercent > 0.4) {
        setVisible(true);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [demoCompleted, dismissed]);

  if (demoCompleted || dismissed) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed bottom-0 left-0 right-0 z-50 p-3 bg-card/95 backdrop-blur-md border-t border-border shadow-lg"
        >
          <div className="container mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Brain className="h-5 w-5 text-primary flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">You haven't tested your mastery yet.</p>
                <p className="text-xs text-muted-foreground hidden sm:block">Take the 20-second check.</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button onClick={onStartDemo} size="sm" className="gap-1.5">
                <Brain className="h-3.5 w-3.5" />
                Start Check
              </Button>
              <button onClick={() => setDismissed(true)} className="p-1.5 rounded-md hover:bg-muted transition-colors">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
