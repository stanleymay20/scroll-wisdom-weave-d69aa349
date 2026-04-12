/**
 * RewardPopup — Animated reward notification
 * Variable rewards with rarity-based styling
 */

import { motion, AnimatePresence } from "framer-motion";
import { useEffect } from "react";
import { X, Sparkles, Zap, Star, Trophy } from "lucide-react";
import type { RewardEvent } from "@/lib/gamificationEngine";

interface RewardPopupProps {
  reward: RewardEvent | null;
  onDismiss: () => void;
  leveledUp?: boolean;
  newLevel?: number;
  onDismissLevelUp?: () => void;
}

const RARITY_STYLES = {
  common: {
    border: 'border-primary/30',
    bg: 'bg-primary/10',
    glow: '',
    icon: Zap,
  },
  uncommon: {
    border: 'border-emerald-500/40',
    bg: 'bg-emerald-500/10',
    glow: 'shadow-lg shadow-emerald-500/20',
    icon: Sparkles,
  },
  rare: {
    border: 'border-amber-500/50',
    bg: 'bg-amber-500/10',
    glow: 'shadow-xl shadow-amber-500/25',
    icon: Star,
  },
  legendary: {
    border: 'border-purple-500/60',
    bg: 'bg-gradient-to-r from-purple-500/15 to-amber-500/15',
    glow: 'shadow-2xl shadow-purple-500/30',
    icon: Trophy,
  },
};

export function RewardPopup({ reward, onDismiss, leveledUp, newLevel, onDismissLevelUp }: RewardPopupProps) {
  // Auto-dismiss reward after 4s
  useEffect(() => {
    if (!reward) return;
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [reward, onDismiss]);

  // Auto-dismiss level up after 5s
  useEffect(() => {
    if (!leveledUp) return;
    const t = setTimeout(() => onDismissLevelUp?.(), 5000);
    return () => clearTimeout(t);
  }, [leveledUp, onDismissLevelUp]);

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 pointer-events-none">
      {/* Level Up */}
      <AnimatePresence>
        {leveledUp && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: -20 }}
            className="pointer-events-auto bg-gradient-to-r from-amber-500 to-orange-500 text-white px-6 py-3 rounded-2xl shadow-2xl shadow-amber-500/30 flex items-center gap-3"
          >
            <Trophy className="h-6 w-6" />
            <div>
              <p className="font-bold text-lg">Level Up!</p>
              <p className="text-sm opacity-90">You reached Level {newLevel}</p>
            </div>
            <button onClick={onDismissLevelUp} className="ml-2 opacity-70 hover:opacity-100">
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reward */}
      <AnimatePresence>
        {reward && (
          <motion.div
            initial={{ opacity: 0, scale: 0.7, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -10 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className={`pointer-events-auto max-w-sm px-5 py-3 rounded-2xl border ${RARITY_STYLES[reward.rarity].border} ${RARITY_STYLES[reward.rarity].bg} ${RARITY_STYLES[reward.rarity].glow} backdrop-blur-md flex items-center gap-3`}
          >
            {(() => {
              const Icon = RARITY_STYLES[reward.rarity].icon;
              return <Icon className="h-5 w-5 text-foreground/80 shrink-0" />;
            })()}
            <p className="text-sm font-medium text-foreground/90">{reward.message}</p>
            <button onClick={onDismiss} className="ml-1 opacity-50 hover:opacity-100 shrink-0">
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
