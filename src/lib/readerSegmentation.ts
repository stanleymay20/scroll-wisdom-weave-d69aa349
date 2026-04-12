/**
 * Reader Segmentation — Deterministic, behavior-based segments
 * Used to personalize intervention strength.
 */

export type ReaderSegment =
  | 'new_reader'
  | 'returning_reader'
  | 'stuck_reader'
  | 'momentum_reader'
  | 'finisher';

export interface ReaderProfile {
  totalBooksOpened: number;
  booksCompleted: number;
  chaptersCompleted: number;
  ch1CompletionRate: number; // 0-1
  currentStreak: number;
  daysSinceFirstVisit: number;
  sessionCount: number;
  stuckVisits: number; // times returned to ch1 without progressing
}

/**
 * Classify a reader into a segment based on observed behavior.
 * Logic is deterministic and auditable.
 */
export function classifyReader(profile: ReaderProfile): ReaderSegment {
  // Finisher: completed at least 1 book
  if (profile.booksCompleted >= 1) {
    return 'finisher';
  }

  // Stuck reader: opened books but can't get past ch1
  if (profile.stuckVisits >= 3 && profile.ch1CompletionRate < 0.3) {
    return 'stuck_reader';
  }

  // Momentum reader: completing chapters, has streak
  if (profile.chaptersCompleted >= 3 && profile.currentStreak >= 2) {
    return 'momentum_reader';
  }

  // Returning reader: has been here before, some progress
  if (profile.sessionCount >= 3 || profile.chaptersCompleted >= 1) {
    return 'returning_reader';
  }

  // New reader: everything else
  return 'new_reader';
}

/** Get intervention config per segment */
export interface InterventionConfig {
  /** Max high-attention interruptions per session */
  maxInterruptionsPerSession: number;
  /** Show summary-first for ch1 */
  showSummaryFirst: boolean;
  /** Show guided mode by default */
  defaultGuidedMode: boolean;
  /** Show rescue prompts */
  showRescuePrompts: boolean;
  /** Reward visibility (0-1) */
  rewardVisibility: number;
  /** AI companion frequency (0-1) */
  aiCompanionFrequency: number;
}

export function getInterventionConfig(segment: ReaderSegment): InterventionConfig {
  switch (segment) {
    case 'new_reader':
      return {
        maxInterruptionsPerSession: 3,
        showSummaryFirst: true,
        defaultGuidedMode: true,
        showRescuePrompts: false, // don't overwhelm new users
        rewardVisibility: 0.8,
        aiCompanionFrequency: 0.6,
      };
    case 'returning_reader':
      return {
        maxInterruptionsPerSession: 2,
        showSummaryFirst: false,
        defaultGuidedMode: true,
        showRescuePrompts: true,
        rewardVisibility: 0.7,
        aiCompanionFrequency: 0.5,
      };
    case 'stuck_reader':
      return {
        maxInterruptionsPerSession: 2,
        showSummaryFirst: true,
        defaultGuidedMode: true,
        showRescuePrompts: true,
        rewardVisibility: 0.5,
        aiCompanionFrequency: 0.7,
      };
    case 'momentum_reader':
      return {
        maxInterruptionsPerSession: 1,
        showSummaryFirst: false,
        defaultGuidedMode: false,
        showRescuePrompts: false,
        rewardVisibility: 0.4,
        aiCompanionFrequency: 0.3,
      };
    case 'finisher':
      return {
        maxInterruptionsPerSession: 1,
        showSummaryFirst: false,
        defaultGuidedMode: false,
        showRescuePrompts: false,
        rewardVisibility: 0.3,
        aiCompanionFrequency: 0.2,
      };
  }
}

// ─── Local profile builder ───

const PROFILE_KEY = 'scroll_reader_profile';

export function loadReaderProfile(): ReaderProfile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* noop */ }
  return {
    totalBooksOpened: 0,
    booksCompleted: 0,
    chaptersCompleted: 0,
    ch1CompletionRate: 0,
    currentStreak: 0,
    daysSinceFirstVisit: 0,
    sessionCount: 1,
    stuckVisits: 0,
  };
}

export function saveReaderProfile(profile: ReaderProfile): void {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch { /* noop */ }
}

export function recordBookOpened(): void {
  const p = loadReaderProfile();
  p.totalBooksOpened++;
  p.sessionCount++;
  saveReaderProfile(p);
}

export function recordChapterCompleted(chapterNumber: number): void {
  const p = loadReaderProfile();
  p.chaptersCompleted++;
  if (chapterNumber === 1) {
    // Update ch1 completion rate (rolling average)
    const total = p.totalBooksOpened || 1;
    const completedCh1s = Math.round(p.ch1CompletionRate * (total - 1)) + 1;
    p.ch1CompletionRate = completedCh1s / total;
  }
  saveReaderProfile(p);
}

export function recordBookCompleted(): void {
  const p = loadReaderProfile();
  p.booksCompleted++;
  saveReaderProfile(p);
}

export function recordStuckVisit(): void {
  const p = loadReaderProfile();
  p.stuckVisits++;
  saveReaderProfile(p);
}

export function updateStreakInProfile(streak: number): void {
  const p = loadReaderProfile();
  p.currentStreak = streak;
  saveReaderProfile(p);
}
