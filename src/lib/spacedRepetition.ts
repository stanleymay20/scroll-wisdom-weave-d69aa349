/**
 * SM-2 Spaced Repetition Algorithm
 * 
 * Based on the SuperMemo SM-2 algorithm with modifications for
 * Bloom's Taxonomy integration. Cards with higher cognitive levels
 * get slightly longer initial intervals.
 */

export interface SRSCard {
  id: string;
  userId: string;
  bookId: string;
  chapterId?: string;
  question: string;
  answer: string;
  bloomLevel: string;
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  nextReviewAt: string;
  lastReviewedAt: string | null;
  totalReviews: number;
  correctReviews: number;
  streak: number;
  createdAt: string;
}

/** Quality rating 0-5 (SM-2 standard) */
export type ReviewQuality = 0 | 1 | 2 | 3 | 4 | 5;

export interface ReviewResult {
  newEaseFactor: number;
  newInterval: number;
  newRepetitions: number;
  nextReviewAt: Date;
}

/** Bloom level bonus: higher cognitive levels get slightly longer initial intervals */
const BLOOM_INTERVAL_BONUS: Record<string, number> = {
  remember: 0,
  understand: 0,
  apply: 0.5,
  analyze: 1,
  evaluate: 1.5,
  create: 2,
};

/**
 * Core SM-2 algorithm with Bloom integration
 */
export function calculateNextReview(
  quality: ReviewQuality,
  currentEaseFactor: number,
  currentInterval: number,
  currentRepetitions: number,
  bloomLevel: string = 'remember'
): ReviewResult {
  let newEaseFactor = currentEaseFactor;
  let newInterval: number;
  let newRepetitions: number;

  // SM-2 ease factor update
  newEaseFactor = currentEaseFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  newEaseFactor = Math.max(1.3, newEaseFactor); // minimum ease factor

  if (quality < 3) {
    // Failed — reset
    newRepetitions = 0;
    newInterval = 1;
  } else {
    // Passed
    newRepetitions = currentRepetitions + 1;

    if (newRepetitions === 1) {
      newInterval = 1 + (BLOOM_INTERVAL_BONUS[bloomLevel] || 0);
    } else if (newRepetitions === 2) {
      newInterval = 6 + (BLOOM_INTERVAL_BONUS[bloomLevel] || 0);
    } else {
      newInterval = Math.round(currentInterval * newEaseFactor);
    }
  }

  const nextReviewAt = new Date();
  nextReviewAt.setDate(nextReviewAt.getDate() + Math.ceil(newInterval));

  return {
    newEaseFactor: Math.round(newEaseFactor * 100) / 100,
    newInterval: Math.ceil(newInterval),
    newRepetitions,
    nextReviewAt,
  };
}

/**
 * Convert a score percentage to SM-2 quality (0-5)
 */
export function scoreToQuality(scorePercent: number): ReviewQuality {
  if (scorePercent >= 95) return 5;
  if (scorePercent >= 80) return 4;
  if (scorePercent >= 60) return 3;
  if (scorePercent >= 40) return 2;
  if (scorePercent >= 20) return 1;
  return 0;
}

/**
 * Get retention rate for a set of cards
 */
export function calculateRetentionRate(cards: SRSCard[]): number {
  if (cards.length === 0) return 0;
  const totalCorrect = cards.reduce((sum, c) => sum + c.correctReviews, 0);
  const totalReviews = cards.reduce((sum, c) => sum + c.totalReviews, 0);
  return totalReviews > 0 ? Math.round((totalCorrect / totalReviews) * 100) : 0;
}

/**
 * Get cards due for review
 */
export function getDueCards(cards: SRSCard[]): SRSCard[] {
  const now = new Date();
  return cards
    .filter(c => new Date(c.nextReviewAt) <= now)
    .sort((a, b) => new Date(a.nextReviewAt).getTime() - new Date(b.nextReviewAt).getTime());
}

/**
 * Get SRS stats summary
 */
export function getSRSStats(cards: SRSCard[]) {
  const now = new Date();
  const due = cards.filter(c => new Date(c.nextReviewAt) <= now).length;
  const learning = cards.filter(c => c.repetitions < 2).length;
  const mature = cards.filter(c => c.intervalDays >= 21).length;
  const young = cards.length - learning - mature;

  return {
    total: cards.length,
    due,
    learning,
    young,
    mature,
    retentionRate: calculateRetentionRate(cards),
    averageEase: cards.length > 0
      ? Math.round((cards.reduce((s, c) => s + c.easeFactor, 0) / cards.length) * 100) / 100
      : 2.5,
  };
}
