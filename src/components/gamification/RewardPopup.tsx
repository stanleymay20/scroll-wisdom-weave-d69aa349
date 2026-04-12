/**
 * RewardPopup v2 — Animated reward notification with particles
 * Variable rewards with rarity-based styling, confetti for rare+
 */

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useMemo } from "react";
import { X, Sparkles, Zap, Star, Trophy, Crown } from "lucide-react";
import type { RewardEvent } from "@/lib/gamificationEngine";

interface RewardPopupProps {
  reward: RewardEvent | null;
  onDismiss: () => void;
  leveledUp?: boolean;
  newLevel?: number;
  onDismissLevelUp?: () => void;
  achievementReward?: RewardEvent | null;
  onDismissAchievement?: () => void;
  streakMilestone?: number | null;
  onDismissStreakMilestone?: () => void;
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
    icon: Crown,
  },
};

// Particle confetti for rare+ rewards
function Particles({ rarity }: { rarity: string }) {
  const particles = useMemo(() => {
    if (rarity !== 'rare' && rarity !== 'legendary') return [];
    const count = rarity === 'legendary' ? 16 : 8;
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      x: (Math.random() - 0.5) * 200,
      y: -(Math.random() * 120 + 40),
      rotate: Math.random() * 360,
      scale: Math.random() * 0.6 + 0.4,
      delay: Math.random() * 0.3,
      color: rarity === 'legendary' 
        ? ['hsl(var(--primary))', 'hsl(45, 100%, 60%)', 'hsl(280, 80%, 60%)'][i % 3]
        : ['hsl(var(--primary))', 'hsl(45, 100%, 60%)'][i % 2],
    }));
  }, [rarity]);

  if (particles.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-visible">
      {particles.map(p => (
        <motion.div
          key={p.id}
          initial={{ opacity: 1, x: 0, y: 0, scale: 0, rotate: 0 }}
          animate={{ opacity: 0, x: p.x, y: p.y, scale: p.scale, rotate: p.rotate }}
          transition={{ duration: 1.2, delay: p.delay, ease: "easeOut" }}
          className="absolute top-1/2 left-1/2 w-2 h-2 rounded-full"
          style={{ backgroundColor: p.color }}
        />
      ))}
    </div>
  );
}

export function RewardPopup({ 
  reward, onDismiss, leveledUp, newLevel, onDismissLevelUp,
  achievementReward, onDismissAchievement,
  streakMilestone, onDismissStreakMilestone,
}: RewardPopupProps) {
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

  // Auto-dismiss achievement after 5s
  useEffect(() => {
    if (!achievementReward) return;
    const t = setTimeout(() => onDismissAchievement?.(), 5000);
    return () => clearTimeout(t);
  }, [achievementReward, onDismissAchievement]);

  // Auto-dismiss streak milestone after 5s
  useEffect(() => {
    if (!streakMilestone) return;
    const t = setTimeout(() => onDismissStreakMilestone?.(), 5000);
    return () => clearTimeout(t);
  }, [streakMilestone, onDismissStreakMilestone]);

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 pointer-events-none">
      {/* Level Up */}
      <AnimatePresence>
        {leveledUp && (
          <motion.div
            initial={{ opacity: 0, scale: 0.3, y: -30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: -20 }}
            transition={{ type: "spring", stiffness: 500, damping: 25 }}
            className="relative pointer-events-auto bg-gradient-to-r from-amber-500 to-orange-500 text-white px-6 py-3 rounded-2xl shadow-2xl shadow-amber-500/30 flex items-center gap-3"
          >
            <Particles rarity="legendary" />
            <motion.div animate={{ rotate: [0, 10, -10, 0] }} transition={{ repeat: 2, duration: 0.4 }}>
              <Trophy className="h-6 w-6" />
            </motion.div>
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

      {/* Achievement */}
      <AnimatePresence>
        {achievementReward && (
          <motion.div
            initial={{ opacity: 0, scale: 0.3, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: -20 }}
            transition={{ type: "spring", stiffness: 500, damping: 25 }}
            className="relative pointer-events-auto bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-3 rounded-2xl shadow-2xl shadow-purple-500/30 flex items-center gap-3"
          >
            <Particles rarity="rare" />
            <Crown className="h-5 w-5" />
            <p className="text-sm font-semibold">{achievementReward.message}</p>
            <button onClick={onDismissAchievement} className="ml-1 opacity-70 hover:opacity-100">
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Streak Milestone */}
      <AnimatePresence>
        {streakMilestone && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="pointer-events-auto bg-gradient-to-r from-red-500 to-orange-500 text-white px-5 py-2.5 rounded-2xl shadow-xl flex items-center gap-2"
          >
            <motion.div animate={{ scale: [1, 1.3, 1] }} transition={{ repeat: 3, duration: 0.5 }}>
              🔥
            </motion.div>
            <p className="text-sm font-bold">{streakMilestone}-Day Streak Milestone!</p>
            <button onClick={onDismissStreakMilestone} className="ml-1 opacity-70 hover:opacity-100">
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reward */}
      <AnimatePresence>
        {reward && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -10 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className={`relative pointer-events-auto max-w-sm px-5 py-3 rounded-2xl border ${RARITY_STYLES[reward.rarity].border} ${RARITY_STYLES[reward.rarity].bg} ${RARITY_STYLES[reward.rarity].glow} backdrop-blur-md flex items-center gap-3`}
          >
            <Particles rarity={reward.rarity} />
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
