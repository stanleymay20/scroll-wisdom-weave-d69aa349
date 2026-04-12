/**
 * StreakAlert v2 — Loss aversion / recovery with animation + previous streak
 */

import { motion, AnimatePresence } from "framer-motion";
import { Flame, X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface StreakAlertProps {
  streakBroken: boolean;
  previousStreak?: number;
  onDismiss: () => void;
  onStartReading?: () => void;
}

export function StreakAlert({ streakBroken, previousStreak = 0, onDismiss, onStartReading }: StreakAlertProps) {
  return (
    <AnimatePresence>
      {streakBroken && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 50, scale: 0.9 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="fixed bottom-24 left-4 right-4 z-50 max-w-sm mx-auto"
        >
          <div className="bg-card border border-destructive/20 rounded-2xl p-5 shadow-2xl shadow-destructive/10">
            <button onClick={onDismiss} className="absolute top-3 right-3 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
            
            <div className="flex items-center gap-3 mb-3">
              <motion.div
                animate={{ rotate: [0, -15, 15, -10, 10, 0] }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="p-2.5 rounded-full bg-destructive/10"
              >
                <Flame className="h-6 w-6 text-destructive" />
              </motion.div>
              <div>
                <p className="font-bold text-foreground">Streak Lost</p>
                {previousStreak > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Your {previousStreak}-day streak has ended
                  </p>
                )}
              </div>
            </div>
            
            <p className="text-sm text-muted-foreground mb-1">
              Start again today — one section is all it takes.
            </p>
            <p className="text-xs text-muted-foreground/70 mb-4">
              Pick up where you left off and rebuild your streak.
            </p>
            
            <Button 
              onClick={() => { onDismiss(); onStartReading?.(); }} 
              className="w-full gap-2 rounded-xl"
              size="sm"
            >
              <Flame className="h-4 w-4" />
              Rebuild My Streak
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
