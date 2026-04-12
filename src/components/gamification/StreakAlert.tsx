/**
 * StreakAlert — Loss aversion / recovery prompts
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
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          className="fixed bottom-24 left-4 right-4 z-50 max-w-sm mx-auto"
        >
          <div className="bg-card border border-border rounded-2xl p-5 shadow-2xl">
            <button onClick={onDismiss} className="absolute top-3 right-3 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
            
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-full bg-orange-500/10">
                <Flame className="h-6 w-6 text-orange-500" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Streak Reset</p>
                {previousStreak > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Your {previousStreak}-day streak has ended
                  </p>
                )}
              </div>
            </div>
            
            <p className="text-sm text-muted-foreground mb-4">
              Start again today — you're one step away from building an unstoppable habit.
            </p>
            
            <Button 
              onClick={() => { onDismiss(); onStartReading?.(); }} 
              className="w-full gap-2"
              size="sm"
            >
              Start Fresh <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
