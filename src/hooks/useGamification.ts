/**
 * useGamification v2 — React hook for the gamification engine
 * Hybrid localStorage + DB sync with combo, achievements, streak milestones
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
  addReadingMinutes,
  getEarnedAchievements,
} from '@/lib/gamificationEngine';

interface UseGamificationReturn {
  state: GamificationState;
  xpProgress: { current: number; needed: number; percent: number };
  streakStatus: 'active' | 'at_risk' | 'broken' | 'none';
  lastReward: RewardEvent | null;
  leveledUp: boolean;
  newLevel: number;
  streakBroken: boolean;
  streakMilestone: number | null;
  achievementReward: RewardEvent | null;
  achievements: Array<{ id: string; label: string; earned: boolean }>;
  completeSection: () => void;
  completeChapter: () => void;
  completeBook: () => void;
  completeQuiz: () => void;
  addMinutes: (mins: number) => void;
  dismissReward: () => void;
  dismissLevelUp: () => void;
  dismissStreakBroken: () => void;
  dismissAchievement: () => void;
  dismissStreakMilestone: () => void;
}

export function useGamification(): UseGamificationReturn {
  const [state, setState] = useState<GamificationState>(loadLocalState);
  const [lastReward, setLastReward] = useState<RewardEvent | null>(null);
  const [leveledUp, setLeveledUp] = useState(false);
  const [streakBroken, setStreakBroken] = useState(false);
  const [streakMilestone, setStreakMilestone] = useState<number | null>(null);
  const [achievementReward, setAchievementReward] = useState<RewardEvent | null>(null);
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Load from DB on mount and merge (prefer higher values)
  useEffect(() => {
    loadFromDatabase().then(dbState => {
      if (!dbState) return;
      setState(prev => {
        const merged: GamificationState = {
          ...prev,
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
      const { state: updated, streakBroken: broken, isNewDay, streakMilestone: milestone } = updateStreak(prev);
      if (broken) setStreakBroken(true);
      if (milestone) setStreakMilestone(milestone);
      if (isNewDay) {
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
      const result = awardXP(prev, amount, action);
      setLastReward(result.reward);
      if (result.leveledUp) setLeveledUp(true);
      if (result.achievementReward) setAchievementReward(result.achievementReward);
      scheduleSync(result.state);
      return result.state;
    });
  }, [scheduleSync]);

  const addMinutes = useCallback((mins: number) => {
    setState(prev => {
      const updated = addReadingMinutes(prev, mins);
      scheduleSync(updated);
      return updated;
    });
  }, [scheduleSync]);

  return {
    state,
    xpProgress: xpProgress(state.xp),
    streakStatus: getStreakStatus(state),
    lastReward,
    leveledUp,
    newLevel: state.level,
    streakBroken,
    streakMilestone,
    achievementReward,
    achievements: getEarnedAchievements(state),
    completeSection: () => doAction(XP_REWARDS.SECTION_COMPLETE, 'section'),
    completeChapter: () => doAction(XP_REWARDS.CHAPTER_COMPLETE, 'chapter'),
    completeBook: () => doAction(XP_REWARDS.BOOK_COMPLETE, 'book'),
    completeQuiz: () => doAction(XP_REWARDS.QUIZ_PASS, 'quiz'),
    addMinutes,
    dismissReward: () => setLastReward(null),
    dismissLevelUp: () => setLeveledUp(false),
    dismissStreakBroken: () => setStreakBroken(false),
    dismissAchievement: () => setAchievementReward(null),
    dismissStreakMilestone: () => setStreakMilestone(null),
  };
}
