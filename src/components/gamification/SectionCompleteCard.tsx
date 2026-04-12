/**
 * SectionCompleteCard v2 — Enhanced micro-completion feedback
 * Animated XP counter, combo display, time stats, streak bonus
 */

import { motion } from "framer-motion";
import { CheckCircle, ArrowRight, Zap, Clock, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SectionCompleteCardProps {
  sectionNumber: number;
  xpEarned: number;
  onNext: () => void;
  nextSectionTitle?: string;
  comboCount?: number;
  timeSpentSeconds?: number;
  streakDays?: number;
  totalSections?: number;
}

export function SectionCompleteCard({ 
  sectionNumber, xpEarned, onNext, nextSectionTitle,
  comboCount = 0, timeSpentSeconds = 0, streakDays = 0, totalSections,
}: SectionCompleteCardProps) {
  const formattedTime = timeSpentSeconds > 0 
    ? timeSpentSeconds < 60 ? `${timeSpentSeconds}s` : `${Math.round(timeSpentSeconds / 60)}m`
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 28 }}
      className="my-6 p-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 backdrop-blur-sm"
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <motion.div
          initial={{ scale: 0, rotate: -90 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 500, delay: 0.1 }}
        >
          <CheckCircle className="h-7 w-7 text-emerald-500" />
        </motion.div>
        <div className="flex-1">
          <p className="font-semibold text-foreground">
            Section {sectionNumber} Complete
            {totalSections ? ` of ${totalSections}` : ''}
          </p>
          <div className="flex items-center gap-3 mt-0.5">
            {/* XP earned with animated counter */}
            <motion.div
              initial={{ x: -10, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="flex items-center gap-1 text-xs text-primary font-bold"
            >
              <Zap className="h-3 w-3" />
              <span>+{xpEarned} XP</span>
            </motion.div>

            {/* Combo bonus */}
            {comboCount > 1 && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.3, type: "spring" }}
                className="flex items-center gap-0.5 text-[10px] text-accent-foreground bg-accent px-1.5 py-0.5 rounded-full font-bold"
              >
                <TrendingUp className="h-2.5 w-2.5" />
                {comboCount}x combo
              </motion.div>
            )}

            {/* Time spent */}
            {formattedTime && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.35 }}
                className="flex items-center gap-0.5 text-[10px] text-muted-foreground"
              >
                <Clock className="h-2.5 w-2.5" />
                {formattedTime}
              </motion.div>
            )}
          </div>
        </div>
      </div>

      {/* Progress dots */}
      {totalSections && totalSections > 1 && (
        <div className="flex gap-1 mb-3">
          {Array.from({ length: totalSections }, (_, i) => (
            <motion.div
              key={i}
              initial={i === sectionNumber - 1 ? { scale: 0 } : false}
              animate={{ scale: 1 }}
              transition={{ delay: 0.1 * i }}
              className={`h-1.5 flex-1 rounded-full ${
                i < sectionNumber ? 'bg-emerald-500' : 'bg-muted'
              }`}
            />
          ))}
        </div>
      )}

      {/* Streak encouragement */}
      {streakDays >= 3 && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-xs text-muted-foreground mb-3"
        >
          🔥 {streakDays}-day streak — your consistency is building mastery
        </motion.p>
      )}
      
      <Button
        variant="ghost"
        size="sm"
        onClick={onNext}
        className="w-full gap-2 text-primary hover:bg-primary/10 font-medium"
      >
        {nextSectionTitle ? `Next: ${nextSectionTitle}` : "Next insight unlocked"} 
        <ArrowRight className="h-4 w-4" />
      </Button>
    </motion.div>
  );
}
