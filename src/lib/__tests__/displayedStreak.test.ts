import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { displayedStreak, type GamificationState } from "../gamificationEngine";

// The engine syncs to Supabase elsewhere; this pure helper never touches it.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

function state(overrides: Partial<GamificationState>): GamificationState {
  return {
    xp: 3761, level: 12,
    streakCurrent: 8, streakBest: 8,
    lastActiveDate: null,
    sectionsCompleted: 0, chaptersCompleted: 0, booksCompleted: 0,
    rewardsEarned: [],
    comboCount: 0, lastActionTime: 0,
    totalReadingMinutes: 0,
    achievementFlags: [],
    ...overrides,
  };
}

describe("displayedStreak", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Midday UTC, so the date helpers' day boundaries cannot shift the result.
    vi.setSystemTime(new Date("2026-09-27T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("shows the streak of a reader who read today", () => {
    expect(displayedStreak(state({ lastActiveDate: "2026-09-27" }))).toBe(8);
  });

  it("still shows it the day after — the streak is at risk, not gone", () => {
    expect(displayedStreak(state({ lastActiveDate: "2026-09-26" }))).toBe(8);
  });

  it("hides it once a day has been missed", () => {
    expect(displayedStreak(state({ lastActiveDate: "2026-09-25" }))).toBe(0);
  });

  it("hides the 8-day streak of a reader who has been away twelve days", () => {
    // The production case: the banner said "8d" beside "12 days ago".
    expect(displayedStreak(state({ lastActiveDate: "2026-09-15" }))).toBe(0);
  });

  it("shows nothing for a reader who has never been active", () => {
    expect(displayedStreak(state({ lastActiveDate: null, streakCurrent: 0 }))).toBe(0);
  });
});
