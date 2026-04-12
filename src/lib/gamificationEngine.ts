/**
 * Gamification Engine v2 — Enterprise-Grade Retention Engine
 * 
 * XP, Levels, Streaks, Variable Rewards, Curiosity Gaps, Combo Multipliers
 * localStorage-first for instant feedback, syncs to DB when authenticated.
 * 
 * v2 upgrades: streak milestone bonuses, combo system, anti-farming cooldowns,
 * weighted contextual curiosity gaps, book-aware hooks, achievement thresholds.
 */

import { supabase } from "@/integrations/supabase/client";

// === XP CONSTANTS ===
export const XP_REWARDS = {
  SECTION_COMPLETE: 5,
  CHAPTER_COMPLETE: 75,
  QUIZ_PASS: 30,
  DAILY_LOGIN: 5,
  BOOK_COMPLETE: 500,
  STREAK_BONUS_3: 10,
  STREAK_BONUS_7: 25,
  STREAK_BONUS_30: 75,
} as const;

// === COMBO MULTIPLIER ===
const COMBO_DECAY_MS = 90_000; // 90 seconds between actions to keep combo
const MAX_COMBO = 5;

export interface GamificationState {
  xp: number;
  level: number;
  streakCurrent: number;
  streakBest: number;
  lastActiveDate: string | null;
  sectionsCompleted: number;
  chaptersCompleted: number;
  booksCompleted: number;
  rewardsEarned: RewardEvent[];
  // v2 additions
  comboCount: number;
  lastActionTime: number;
  totalReadingMinutes: number;
  achievementFlags: string[];
}

export interface RewardEvent {
  type: 'xp_boost' | 'rare_insight' | 'encouragement' | 'unlock_preview' | 'streak_milestone' | 'combo_bonus' | 'achievement';
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
  return { current: progress, needed, percent: Math.min(100, Math.round((progress / needed) * 100)) };
}

// === LOCAL STORAGE ===
const STORAGE_KEY = 'scroll_gamification';
const COOLDOWN_KEY = 'scroll_gam_cooldown';

function getDefaultState(): GamificationState {
  return {
    xp: 0, level: 1,
    streakCurrent: 0, streakBest: 0,
    lastActiveDate: null,
    sectionsCompleted: 0, chaptersCompleted: 0, booksCompleted: 0,
    rewardsEarned: [],
    comboCount: 0, lastActionTime: 0,
    totalReadingMinutes: 0,
    achievementFlags: [],
  };
}

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

// === ANTI-FARMING COOLDOWN ===
function checkCooldown(action: string): boolean {
  try {
    const raw = localStorage.getItem(COOLDOWN_KEY);
    const cooldowns: Record<string, number> = raw ? JSON.parse(raw) : {};
    const lastTime = cooldowns[action] || 0;
    const minInterval = action === 'section' ? 5000 : action === 'chapter' ? 30000 : 3000;
    if (Date.now() - lastTime < minInterval) return false;
    cooldowns[action] = Date.now();
    localStorage.setItem(COOLDOWN_KEY, JSON.stringify(cooldowns));
    return true;
  } catch { return true; }
}

// === STREAK LOGIC ===
function getToday(): string { return new Date().toISOString().split('T')[0]; }
function getYesterday(): string {
  const d = new Date(); d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

export function updateStreak(state: GamificationState): { 
  state: GamificationState; streakBroken: boolean; isNewDay: boolean; streakMilestone: number | null 
} {
  const today = getToday();
  const yesterday = getYesterday();
  
  if (state.lastActiveDate === today) {
    return { state, streakBroken: false, isNewDay: false, streakMilestone: null };
  }
  
  let newStreak = state.streakCurrent;
  let streakBroken = false;
  
  if (state.lastActiveDate === yesterday) {
    newStreak += 1;
  } else if (state.lastActiveDate && state.lastActiveDate !== today) {
    streakBroken = state.streakCurrent > 0;
    newStreak = 1;
  } else {
    newStreak = 1;
  }
  
  // Check for milestone
  const milestones = [3, 7, 14, 30, 60, 100];
  const streakMilestone = milestones.includes(newStreak) ? newStreak : null;
  
  const updated: GamificationState = {
    ...state,
    streakCurrent: newStreak,
    streakBest: Math.max(state.streakBest, newStreak),
    lastActiveDate: today,
  };
  
  return { state: updated, streakBroken, isNewDay: true, streakMilestone };
}

// === COMBO SYSTEM ===
function updateCombo(state: GamificationState): { combo: number; multiplier: number } {
  const now = Date.now();
  const elapsed = now - state.lastActionTime;
  
  if (elapsed < COMBO_DECAY_MS && state.comboCount > 0) {
    const combo = Math.min(state.comboCount + 1, MAX_COMBO);
    return { combo, multiplier: 1 + (combo * 0.1) }; // 1.1x to 1.5x
  }
  return { combo: 1, multiplier: 1 };
}

// === VARIABLE REWARD SYSTEM (Enhanced) ===
const REWARD_POOL: Array<{ weight: number; generator: (xp: number, context: { combo: number; streak: number }) => RewardEvent }> = [
  {
    weight: 30,
    generator: (xp) => ({
      type: 'xp_boost', message: `+${xp} XP earned!`,
      xpAmount: xp, timestamp: new Date().toISOString(), rarity: 'common',
    }),
  },
  {
    weight: 22,
    generator: (_xp, ctx) => {
      const messages = ctx.streak >= 3
        ? [
            `🔥 ${ctx.streak}-day streak — your consistency is building real understanding`,
            `💪 Showing up daily is how deep learning happens`,
            `⚡ Steady momentum — you're making this a habit`,
          ]
        : [
            "🧠 You're building understanding one section at a time",
            "💡 Consistent effort is the best learning strategy",
            "⚡ Your momentum is real — keep going",
            "🌱 Every section compounds — you're investing in future you",
            "🎯 Steady progress adds up — you're doing great",
          ];
      return {
        type: 'encouragement',
        message: messages[Math.floor(Math.random() * messages.length)],
        timestamp: new Date().toISOString(), rarity: 'common',
      };
    },
  },
  {
    weight: 18,
    generator: () => {
      const insights = [
        "💎 You're connecting ideas across chapters — that's real understanding",
        "🌟 This concept unlocks advanced topics ahead",
        "🧩 What you just learned links to a powerful framework",
        "🔬 This pattern appears across multiple disciplines",
        "💡 You're going deeper than surface level — well done",
      ];
      return {
        type: 'rare_insight',
        message: insights[Math.floor(Math.random() * insights.length)],
        timestamp: new Date().toISOString(), rarity: 'uncommon',
      };
    },
  },
  {
    weight: 12,
    generator: (_xp, ctx) => {
      if (ctx.combo >= 3) {
        return {
          type: 'combo_bonus', message: `🔗 ${ctx.combo}x COMBO! Bonus XP multiplier active`,
          xpAmount: Math.round(ctx.combo * 5),
          timestamp: new Date().toISOString(), rarity: 'rare',
        };
      }
      return {
        type: 'unlock_preview',
        message: "🔓 Preview unlocked: A powerful insight awaits in the next section",
        timestamp: new Date().toISOString(), rarity: 'rare',
      };
    },
  },
  {
    weight: 10,
    generator: () => ({
      type: 'unlock_preview',
      message: "🔓 You've earned early access to an advanced concept ahead",
      timestamp: new Date().toISOString(), rarity: 'rare',
    }),
  },
  {
    weight: 5,
    generator: () => ({
      type: 'rare_insight',
      message: "⭐ Mastery milestone reached — your understanding is deepening",
      timestamp: new Date().toISOString(), rarity: 'legendary',
    }),
  },
  {
    weight: 3,
    generator: () => ({
      type: 'achievement',
      message: "🏆 Achievement Unlocked — Scholar's Dedication",
      timestamp: new Date().toISOString(), rarity: 'legendary',
    }),
  },
];

export function generateReward(baseXP: number, context: { combo: number; streak: number } = { combo: 1, streak: 0 }): RewardEvent {
  const totalWeight = REWARD_POOL.reduce((sum, r) => sum + r.weight, 0);
  let rand = Math.random() * totalWeight;
  for (const pool of REWARD_POOL) {
    rand -= pool.weight;
    if (rand <= 0) return pool.generator(baseXP, context);
  }
  return REWARD_POOL[0].generator(baseXP, context);
}

// === CURIOSITY GAP MESSAGES (Contextual) ===
const CURIOSITY_GAPS: Record<string, string[]> = {
  early: [
    "The foundation you just built enables something powerful next…",
    "The next section builds directly on what you just learned.",
    "You're setting up the key concepts — keep going.",
  ],
  mid: [
    "The next section ties several ideas together.",
    "The pattern you've been building toward reveals itself next.",
    "This is where the pieces start fitting together.",
  ],
  late: [
    "You're close to finishing — the final ideas are just ahead.",
    "This is where it gets really interesting…",
    "The last section brings it all together.",
  ],
};

export function getCuriosityGap(progressPercent: number = 50): string {
  const pool = progressPercent < 30 ? CURIOSITY_GAPS.early 
    : progressPercent < 70 ? CURIOSITY_GAPS.mid 
    : CURIOSITY_GAPS.late;
  return pool[Math.floor(Math.random() * pool.length)];
}

// === HOOK MESSAGES (Book-aware) ===
const CHAPTER_HOOKS: Record<string, string[]> = {
  default: [
    "Let's explore the next key idea together",
    "One concept at a time — here's what's next",
    "Ready to continue? This chapter builds on what you know",
    "The next idea connects to what you've already learned",
    "A short read that adds to your understanding",
    "Let's pick up where you left off",
  ],
};

export function getChapterHook(chapterNumber: number): string {
  const pool = CHAPTER_HOOKS.default;
  return pool[(chapterNumber - 1) % pool.length];
}

// === ACHIEVEMENT SYSTEM ===
interface AchievementCheck {
  id: string;
  label: string;
  check: (s: GamificationState) => boolean;
}

const ACHIEVEMENTS: AchievementCheck[] = [
  { id: 'first_section', label: '📖 First Steps', check: s => s.sectionsCompleted >= 1 },
  { id: 'ten_sections', label: '📚 Knowledge Seeker', check: s => s.sectionsCompleted >= 10 },
  { id: 'fifty_sections', label: '🏅 Dedicated Learner', check: s => s.sectionsCompleted >= 50 },
  { id: 'first_chapter', label: '📘 Chapter Champion', check: s => s.chaptersCompleted >= 1 },
  { id: 'five_chapters', label: '🎓 Scholar', check: s => s.chaptersCompleted >= 5 },
  { id: 'first_book', label: '🏆 Book Finisher', check: s => s.booksCompleted >= 1 },
  { id: 'streak_7', label: '🔥 Week Warrior', check: s => s.streakBest >= 7 },
  { id: 'streak_30', label: '💎 Monthly Master', check: s => s.streakBest >= 30 },
  { id: 'xp_500', label: '⚡ XP Hunter', check: s => s.xp >= 500 },
  { id: 'xp_2000', label: '🌟 XP Legend', check: s => s.xp >= 2000 },
  { id: 'level_5', label: '📈 Level 5 Reader', check: s => s.level >= 5 },
  { id: 'level_10', label: '👑 Level 10 Master', check: s => s.level >= 10 },
];

function checkAchievements(state: GamificationState): { newAchievements: string[]; rewards: RewardEvent[] } {
  const newAchievements: string[] = [];
  const rewards: RewardEvent[] = [];
  
  for (const ach of ACHIEVEMENTS) {
    if (!state.achievementFlags.includes(ach.id) && ach.check(state)) {
      newAchievements.push(ach.id);
      rewards.push({
        type: 'achievement',
        message: `${ach.label} — Achievement Unlocked!`,
        xpAmount: 25,
        timestamp: new Date().toISOString(),
        rarity: ach.id.includes('streak_30') || ach.id.includes('level_10') ? 'legendary' : 'rare',
      });
    }
  }
  
  return { newAchievements, rewards };
}

export function getEarnedAchievements(state: GamificationState): Array<{ id: string; label: string; earned: boolean }> {
  return ACHIEVEMENTS.map(a => ({
    id: a.id, label: a.label,
    earned: state.achievementFlags.includes(a.id),
  }));
}

// === CORE ACTIONS ===
export function awardXP(
  state: GamificationState,
  amount: number,
  action: 'section' | 'chapter' | 'quiz' | 'book' | 'daily'
): { state: GamificationState; reward: RewardEvent; leveledUp: boolean; achievementReward?: RewardEvent } {
  // Anti-farming: cooldown check (skip for daily login)
  if (action !== 'daily' && !checkCooldown(action)) {
    return {
      state,
      reward: { type: 'encouragement', message: 'Keep reading for more XP!', timestamp: new Date().toISOString(), rarity: 'common' },
      leveledUp: false,
    };
  }
  
  // Combo system
  const { combo, multiplier } = updateCombo(state);
  const comboXP = Math.round(amount * multiplier);
  
  const context = { combo, streak: state.streakCurrent };
  const reward = generateReward(comboXP, context);
  const actualXP = reward.type === 'xp_boost' && reward.xpAmount ? reward.xpAmount : comboXP;
  
  // Streak milestone bonus
  let streakBonusXP = 0;
  if (state.streakCurrent === 3) streakBonusXP = XP_REWARDS.STREAK_BONUS_3;
  else if (state.streakCurrent === 7) streakBonusXP = XP_REWARDS.STREAK_BONUS_7;
  else if (state.streakCurrent === 30) streakBonusXP = XP_REWARDS.STREAK_BONUS_30;
  
  const newXP = state.xp + actualXP + streakBonusXP;
  const oldLevel = state.level;
  const newLevel = calculateLevel(newXP);
  
  let updated: GamificationState = {
    ...state,
    xp: newXP,
    level: newLevel,
    sectionsCompleted: action === 'section' ? state.sectionsCompleted + 1 : state.sectionsCompleted,
    chaptersCompleted: action === 'chapter' ? state.chaptersCompleted + 1 : state.chaptersCompleted,
    booksCompleted: action === 'book' ? state.booksCompleted + 1 : state.booksCompleted,
    rewardsEarned: [...state.rewardsEarned.slice(-99), reward],
    comboCount: combo,
    lastActionTime: Date.now(),
  };
  
  // Check achievements
  const { newAchievements, rewards: achievementRewards } = checkAchievements(updated);
  if (newAchievements.length > 0) {
    updated = {
      ...updated,
      achievementFlags: [...updated.achievementFlags, ...newAchievements],
      xp: updated.xp + (achievementRewards.length * 25),
      level: calculateLevel(updated.xp + (achievementRewards.length * 25)),
      rewardsEarned: [...updated.rewardsEarned, ...achievementRewards],
    };
  }
  
  saveLocalState(updated);
  
  return {
    state: updated,
    reward: streakBonusXP > 0 
      ? { ...reward, message: `${reward.message} + 🔥 Streak Bonus +${streakBonusXP} XP!` }
      : reward,
    leveledUp: calculateLevel(updated.xp) > oldLevel,
    achievementReward: achievementRewards[0],
  };
}

// === READING TIME TRACKING ===
export function addReadingMinutes(state: GamificationState, minutes: number): GamificationState {
  const updated = { ...state, totalReadingMinutes: state.totalReadingMinutes + minutes };
  saveLocalState(updated);
  return updated;
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
    ...getDefaultState(),
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
