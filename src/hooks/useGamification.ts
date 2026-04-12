/**
 * useGamification — React hook for the gamification engine
 * Hybrid localStorage + DB sync
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  type GamificationState,
  type RewardEvent,
  loadLocalState,
  loadFromDatabase,
  syncToDatabase,
  updateStreak,
  awardXP,
  XP_REWARDS,
  getStreakStatus,
  calculateLevel,
  xpProgress,
} from '@/lib/gamificationEngine';

interface UseGamificationReturn {
  state: GamificationState;
  xpProgress: { current: number; needed: number; percent: number };
  streakStatus: 'active' | 'at_risk' | 'broken' | 'none';
  lastReward: RewardEvent | null;
  leveledUp: boolean;
  streakBroken: boolean;
  completeSection: () => void;
  completeChapter: () => void;
  completeBook: () => void;
  completeQuiz: () => void;
  dismissReward: () => void;
  dismissLevelUp: () => void;
  dismissStreakBroken: () => void;
}

export function useGamification(): UseGamificationReturn {
  const [state, setState] = useState<GamificationState>(loadLocalState);
  const [lastReward, setLastReward] = useState<RewardEvent | null>(null);
  const [leveledUp, setLeveledUp] = useState(false);
  const [streakBroken, setStreakBroken] = useState(false);
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Load from DB on mount and merge (prefer higher values)
  useEffect(() => {
    loadFromDatabase().then(dbState => {
      if (!dbState) return;
      setState(prev => {
        const merged: GamificationState = {
          xp: Math.max(prev.xp, dbState.xp),
          level: calculateLevel(Math.max(prev.xp, dbState.xp)),
          streakCurrent: Math.max(prev.streakCurrent, dbState.streakCurrent),
          streakBest: Math.max(prev.streakBest, dbState.streakBest),
          lastActiveDate: prev.lastActiveDate && dbState.lastActiveDate
            ? (prev.lastActiveDate > dbState.lastActiveDate ? prev.lastActiveDate : dbState.lastActiveDate)
            : prev.lastActiveDate || dbState.lastActiveDate,
          sectionsCompleted: Math.max(prev.sectionsCompleted, dbState.sectionsCompleted),
          chaptersCompleted: Math.max(prev.chaptersCompleted, dbState.chaptersCompleted),
          booksCompleted: Math.max(prev.booksCompleted, dbState.booksCompleted),
          rewardsEarned: prev.rewardsEarned.length > dbState.rewardsEarned.length ? prev.rewardsEarned : dbState.rewardsEarned,
        };
        return merged;
      });
    });
  }, []);

  // Update streak on mount
  useEffect(() => {
    setState(prev => {
      const { state: updated, streakBroken: broken, isNewDay } = updateStreak(prev);
      if (broken) setStreakBroken(true);
      if (isNewDay) {
        // Award daily login XP
        const { state: withXP } = awardXP(updated, XP_REWARDS.DAILY_LOGIN, 'daily');
        return withXP;
      }
      return updated;
    });
  }, []);

  // Debounced DB sync
  const scheduleSync = useCallback((s: GamificationState) => {
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(() => syncToDatabase(s), 3000);
  }, []);

  const doAction = useCallback((amount: number, action: 'section' | 'chapter' | 'quiz' | 'book') => {
    setState(prev => {
      const { state: updated, reward, leveledUp: leveled } = awardXP(prev, amount, action);
      setLastReward(reward);
      if (leveled) setLeveledUp(true);
      scheduleSync(updated);
      return updated;
    });
  }, [scheduleSync]);

  return {
    state,
    xpProgress: xpProgress(state.xp),
    streakStatus: getStreakStatus(state) as any,
    lastReward,
    leveledUp,
    streakBroken,
    completeSection: () => doAction(XP_REWARDS.SECTION_COMPLETE, 'section'),
    completeChapter: () => doAction(XP_REWARDS.CHAPTER_COMPLETE, 'chapter'),
    completeBook: () => doAction(XP_REWARDS.BOOK_COMPLETE, 'book'),
    completeQuiz: () => doAction(XP_REWARDS.QUIZ_PASS, 'quiz'),
    dismissReward: () => setLastReward(null),
    dismissLevelUp: () => setLeveledUp(false),
    dismissStreakBroken: () => setStreakBroken(false),
  };
}
