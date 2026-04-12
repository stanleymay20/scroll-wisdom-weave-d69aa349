/**
 * GamificationBar v2 — Enterprise XP, Level, Streak, Combo display
 * Animated counters, tooltips, fire animation, combo indicator
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Flame, Zap, TrendingUp, Trophy, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import type { GamificationState } from "@/lib/gamificationEngine";

interface GamificationBarProps {
  state: GamificationState;
  xpProgress: { current: number; needed: number; percent: number };
  streakStatus: 'active' | 'at_risk' | 'broken' | 'none';
  className?: string;
  compact?: boolean;
}

export function GamificationBar({ state, xpProgress, streakStatus, className, compact }: GamificationBarProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={cn("relative", className)}>
      {/* Compact bar */}
      <button 
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2.5 w-full"
      >
        {/* Streak with fire animation */}
        {state.streakCurrent > 0 && (
          <motion.div 
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold tabular-nums",
              streakStatus === 'active' && "bg-destructive/15 text-destructive",
              streakStatus === 'at_risk' && "bg-accent text-accent-foreground",
            )}
            animate={streakStatus === 'at_risk' ? { scale: [1, 1.05, 1] } : {}}
            transition={{ repeat: Infinity, duration: 1.5 }}
          >
            <motion.div
              animate={{ rotate: [0, -8, 8, -4, 0] }}
              transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
            >
              <Flame className="h-3.5 w-3.5" />
            </motion.div>
            <span>{state.streakCurrent}</span>
          </motion.div>
        )}

        {/* Level badge */}
        <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold">
          <TrendingUp className="h-3.5 w-3.5" />
          <span>Lv.{state.level}</span>
        </div>

        {/* Combo indicator */}
        {state.comboCount > 1 && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-accent text-accent-foreground text-[10px] font-bold"
          >
            <Zap className="h-3 w-3" />
            {state.comboCount}x
          </motion.div>
        )}

        {/* XP Progress bar */}
        {!compact && (
          <div className="flex items-center gap-1.5 flex-1 min-w-[70px]">
            <Zap className="h-3 w-3 text-primary shrink-0" />
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-primary rounded-full"
                initial={false}
                animate={{ width: `${xpProgress.percent}%` }}
                transition={{ duration: 0.6, ease: "easeOut" }}
              />
            </div>
            <motion.span 
              key={state.xp}
              initial={{ y: -8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="text-[10px] text-muted-foreground font-mono tabular-nums"
            >
              {state.xp}
            </motion.span>
          </div>
        )}

        <ChevronUp className={cn(
          "h-3 w-3 text-muted-foreground transition-transform",
          expanded && "rotate-180"
        )} />
      </button>

      {/* Expanded detail panel */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -4 }}
            animate={{ opacity: 1, height: "auto", y: 0 }}
            exit={{ opacity: 0, height: 0, y: -4 }}
            className="absolute top-full left-0 right-0 mt-2 z-50 bg-card border border-border rounded-xl shadow-xl p-4 space-y-3"
          >
            {/* XP to next level */}
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-muted-foreground">Level {state.level} → {state.level + 1}</span>
                <span className="font-mono text-foreground">{xpProgress.current} / {xpProgress.needed} XP</span>
              </div>
              <Progress value={xpProgress.percent} className="h-2" />
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-3 gap-2">
              <StatBox icon="📖" label="Sections" value={state.sectionsCompleted} />
              <StatBox icon="📘" label="Chapters" value={state.chaptersCompleted} />
              <StatBox icon="📚" label="Books" value={state.booksCompleted} />
            </div>

            {/* Streak info */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Best streak</span>
              <span className="flex items-center gap-1 font-semibold">
                <Flame className="h-3 w-3 text-destructive" />
                {state.streakBest} days
              </span>
            </div>

            {/* Reading time */}
            {state.totalReadingMinutes > 0 && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Total reading</span>
                <span className="font-semibold">{Math.round(state.totalReadingMinutes)} min</span>
              </div>
            )}

            {/* Achievements preview */}
            {state.achievementFlags.length > 0 && (
              <div className="flex items-center gap-1 text-xs">
                <Trophy className="h-3 w-3 text-primary" />
                <span className="text-muted-foreground">{state.achievementFlags.length} achievements</span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatBox({ icon, label, value }: { icon: string; label: string; value: number }) {
  return (
    <div className="text-center p-2 rounded-lg bg-muted/50">
      <div className="text-sm">{icon}</div>
      <div className="text-sm font-bold tabular-nums">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}
