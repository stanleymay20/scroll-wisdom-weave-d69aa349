/**
 * GamificationBar — XP, Level, and Streak display
 * Compact bar for the reader header area
 */

import { motion } from "framer-motion";
import { Flame, Zap, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GamificationState } from "@/lib/gamificationEngine";

interface GamificationBarProps {
  state: GamificationState;
  xpProgress: { current: number; needed: number; percent: number };
  streakStatus: 'active' | 'at_risk' | 'broken' | 'none';
  className?: string;
  compact?: boolean;
}

export function GamificationBar({ state, xpProgress, streakStatus, className, compact }: GamificationBarProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      {/* Streak */}
      {state.streakCurrent > 0 && (
        <div className={cn(
          "flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold",
          streakStatus === 'active' && "bg-destructive/15 text-destructive",
          streakStatus === 'at_risk' && "bg-accent/15 text-accent-foreground animate-pulse",
        )}>
          <Flame className="h-3.5 w-3.5" />
          <span>{state.streakCurrent}</span>
        </div>
      )}

      {/* Level */}
      <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">
        <TrendingUp className="h-3.5 w-3.5" />
        <span>Lv.{state.level}</span>
      </div>

      {/* XP Progress */}
      {!compact && (
        <div className="flex items-center gap-2 min-w-[80px]">
          <Zap className="h-3.5 w-3.5 text-primary" />
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-primary rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${xpProgress.percent}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground font-mono">{state.xp}</span>
        </div>
      )}
    </div>
  );
}
