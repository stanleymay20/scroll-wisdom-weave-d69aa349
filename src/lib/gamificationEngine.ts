/**
 * Gamification Engine — Hybrid localStorage + DB
 * 
 * XP, Levels, Streaks, Variable Rewards, Curiosity Gaps
 * localStorage-first for instant feedback, syncs to DB when authenticated.
 */

import { supabase } from "@/integrations/supabase/client";

// === XP CONSTANTS ===
export const XP_REWARDS = {
  SECTION_COMPLETE: 10,
  CHAPTER_COMPLETE: 50,
  QUIZ_PASS: 25,
  DAILY_LOGIN: 5,
  BOOK_COMPLETE: 200,
  STREAK_BONUS_3: 15,
  STREAK_BONUS_7: 30,
  STREAK_BONUS_30: 100,
} as const;

export interface GamificationState {
  xp: number;
  level: number;
  streakCurrent: number;
  streakBest: number;
  lastActiveDate: string | null; // ISO date string YYYY-MM-DD
  sectionsCompleted: number;
  chaptersCompleted: number;
  booksCompleted: number;
  rewardsEarned: RewardEvent[];
}

export interface RewardEvent {
  type: 'xp_boost' | 'rare_insight' | 'encouragement' | 'unlock_preview' | 'streak_milestone';
  message: string;
  xpAmount?: number;
  timestamp: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary';
}

// === LEVEL FORMULA ===
export function calculateLevel(xp: number): number {
  return Math.floor(Math.sqrt(xp / 100)) + 1;
}

export function xpForLevel(level: number): number {
  return (level - 1) * (level - 1) * 100;
}

export function xpProgress(xp: number): { current: number; needed: number; percent: number } {
  const level = calculateLevel(xp);
  const currentLevelXP = xpForLevel(level);
  const nextLevelXP = xpForLevel(level + 1);
  const progress = xp - currentLevelXP;
  const needed = nextLevelXP - currentLevelXP;
  return { current: progress, needed, percent: Math.round((progress / needed) * 100) };
}

// === LOCAL STORAGE KEY ===
const STORAGE_KEY = 'scroll_gamification';

function getDefaultState(): GamificationState {
  return {
    xp: 0,
    level: 1,
    streakCurrent: 0,
    streakBest: 0,
    lastActiveDate: null,
    sectionsCompleted: 0,
    chaptersCompleted: 0,
    booksCompleted: 0,
    rewardsEarned: [],
  };
}

// === LOCAL STORAGE OPERATIONS ===
export function loadLocalState(): GamificationState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...getDefaultState(), ...JSON.parse(raw) };
  } catch { /* noop */ }
  return getDefaultState();
}

function saveLocalState(state: GamificationState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* noop */ }
}

// === STREAK LOGIC ===
function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

function getYesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

export function updateStreak(state: GamificationState): { state: GamificationState; streakBroken: boolean; isNewDay: boolean } {
  const today = getToday();
  const yesterday = getYesterday();
  
  if (state.lastActiveDate === today) {
    return { state, streakBroken: false, isNewDay: false };
  }
  
  let newStreak = state.streakCurrent;
  let streakBroken = false;
  
  if (state.lastActiveDate === yesterday) {
    newStreak += 1;
  } else if (state.lastActiveDate && state.lastActiveDate !== today) {
    streakBroken = state.streakCurrent > 0;
    newStreak = 1; // Reset, but today counts
  } else {
    newStreak = 1; // First day
  }
  
  const updated: GamificationState = {
    ...state,
    streakCurrent: newStreak,
    streakBest: Math.max(state.streakBest, newStreak),
    lastActiveDate: today,
  };
  
  return { state: updated, streakBroken, isNewDay: true };
}

// === VARIABLE REWARD SYSTEM ===
const REWARD_POOL: Array<{ weight: number; generator: (xp: number) => RewardEvent }> = [
  {
    weight: 40,
    generator: (xp) => ({
      type: 'xp_boost',
      message: `+${xp} XP earned!`,
      xpAmount: xp,
      timestamp: new Date().toISOString(),
      rarity: 'common',
    }),
  },
  {
    weight: 25,
    generator: () => {
      const messages = [
        "🧠 You're building neural pathways that 92% of learners never reach",
        "💡 Your consistency is in the top 15% of all readers",
        "🎯 Keep this pace and you'll finish 3x faster than average",
        "⚡ Your learning velocity just increased — momentum is real",
      ];
      return {
        type: 'encouragement',
        message: messages[Math.floor(Math.random() * messages.length)],
        timestamp: new Date().toISOString(),
        rarity: 'common',
      };
    },
  },
  {
    weight: 20,
    generator: () => {
      const insights = [
        "🔥 Rare Insight: Only 12% of readers reach this depth of understanding",
        "💎 Hidden Pattern Detected: You're connecting ideas across chapters",
        "🌟 Breakthrough Moment: This concept unlocks 3 advanced topics ahead",
        "🧩 Deep Connection: What you just learned links to a powerful framework",
      ];
      return {
        type: 'rare_insight',
        message: insights[Math.floor(Math.random() * insights.length)],
        timestamp: new Date().toISOString(),
        rarity: 'uncommon',
      };
    },
  },
  {
    weight: 10,
    generator: () => ({
      type: 'unlock_preview',
      message: "🔓 Preview unlocked: A powerful insight awaits in the next section",
      timestamp: new Date().toISOString(),
      rarity: 'rare',
    }),
  },
  {
    weight: 5,
    generator: () => ({
      type: 'rare_insight',
      message: "⭐ LEGENDARY: You've reached a mastery milestone that fewer than 3% achieve",
      timestamp: new Date().toISOString(),
      rarity: 'legendary',
    }),
  },
];

export function generateReward(baseXP: number): RewardEvent {
  const totalWeight = REWARD_POOL.reduce((sum, r) => sum + r.weight, 0);
  let rand = Math.random() * totalWeight;
  for (const pool of REWARD_POOL) {
    rand -= pool.weight;
    if (rand <= 0) return pool.generator(baseXP);
  }
  return REWARD_POOL[0].generator(baseXP);
}

// === CURIOSITY GAP MESSAGES ===
const CURIOSITY_GAPS = [
  "What comes next will change how you think about this entirely…",
  "Most people misunderstand the next concept — you won't.",
  "The next section contains the key insight that ties everything together.",
  "You're about to discover something that surprises even experts.",
  "Don't stop now — the breakthrough idea is in the next section.",
  "The pattern you've been building toward reveals itself next.",
  "Warning: the next section may permanently change your perspective.",
  "This is where it gets really interesting…",
];

export function getCuriosityGap(): string {
  return CURIOSITY_GAPS[Math.floor(Math.random() * CURIOSITY_GAPS.length)];
}

// === HOOK MESSAGES ===
const CHAPTER_HOOKS: Record<string, string[]> = {
  default: [
    "This chapter contains an idea that will reshape your understanding",
    "In the next 3 minutes, you'll learn something most people never discover",
    "One powerful concept. Let's unlock it together.",
    "Ready for the insight that connects everything?",
  ],
};

export function getChapterHook(chapterNumber: number): string {
  const pool = CHAPTER_HOOKS.default;
  return pool[(chapterNumber - 1) % pool.length];
}

// === CORE ACTIONS ===
export function awardXP(
  state: GamificationState,
  amount: number,
  action: 'section' | 'chapter' | 'quiz' | 'book' | 'daily'
): { state: GamificationState; reward: RewardEvent; leveledUp: boolean } {
  const reward = generateReward(amount);
  const actualXP = reward.type === 'xp_boost' && reward.xpAmount ? reward.xpAmount : amount;
  
  const newXP = state.xp + actualXP;
  const oldLevel = state.level;
  const newLevel = calculateLevel(newXP);
  
  const updated: GamificationState = {
    ...state,
    xp: newXP,
    level: newLevel,
    sectionsCompleted: action === 'section' ? state.sectionsCompleted + 1 : state.sectionsCompleted,
    chaptersCompleted: action === 'chapter' ? state.chaptersCompleted + 1 : state.chaptersCompleted,
    booksCompleted: action === 'book' ? state.booksCompleted + 1 : state.booksCompleted,
    rewardsEarned: [...state.rewardsEarned.slice(-49), reward],
  };
  
  saveLocalState(updated);
  
  return { state: updated, reward, leveledUp: newLevel > oldLevel };
}

// === DB SYNC ===
export async function syncToDatabase(state: GamificationState): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  
  const { error } = await supabase
    .from('user_gamification')
    .upsert({
      user_id: user.id,
      xp: state.xp,
      level: state.level,
      streak_current: state.streakCurrent,
      streak_best: state.streakBest,
      last_active_date: state.lastActiveDate,
      sections_completed: state.sectionsCompleted,
      chapters_completed: state.chaptersCompleted,
      books_completed: state.booksCompleted,
      rewards_earned: state.rewardsEarned as any,
    }, { onConflict: 'user_id' });
  
  if (error) console.warn('[Gamification] Sync failed:', error.message);
}

export async function loadFromDatabase(): Promise<GamificationState | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  
  const { data, error } = await supabase
    .from('user_gamification')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();
  
  if (error || !data) return null;
  
  return {
    xp: data.xp,
    level: data.level,
    streakCurrent: data.streak_current,
    streakBest: data.streak_best,
    lastActiveDate: data.last_active_date,
    sectionsCompleted: data.sections_completed,
    chaptersCompleted: data.chapters_completed,
    booksCompleted: data.books_completed,
    rewardsEarned: (data.rewards_earned as unknown as RewardEvent[]) || [],
  };
}

// === STREAK STATUS HELPERS ===
export function getStreakStatus(state: GamificationState): 'active' | 'at_risk' | 'broken' | 'none' {
  const today = getToday();
  const yesterday = getYesterday();
  
  if (!state.lastActiveDate) return 'none';
  if (state.lastActiveDate === today) return 'active';
  if (state.lastActiveDate === yesterday) return 'at_risk';
  return 'broken';
}

export function getStreakMessage(status: string, streak: number): string {
  switch (status) {
    case 'active': return `🔥 ${streak} Day Streak — Keep it alive!`;
    case 'at_risk': return `⚠️ Your ${streak} day streak is about to break!`;
    case 'broken': return "Start again today — you're one step away from greatness";
    default: return "Start your reading streak today!";
  }
}
