import { describe, it, expect } from 'vitest';
import {
  calculateNextReview,
  scoreToQuality,
  calculateRetentionRate,
  getDueCards,
  getSRSStats,
  type SRSCard,
  type ReviewQuality,
} from '../spacedRepetition';

describe('SM-2 Spaced Repetition', () => {
  describe('calculateNextReview', () => {
    it('resets interval on failure (quality < 3)', () => {
      const result = calculateNextReview(2, 2.5, 10, 3, 'remember');
      expect(result.newRepetitions).toBe(0);
      expect(result.newInterval).toBe(1);
    });

    it('sets interval to 1 on first successful review', () => {
      const result = calculateNextReview(4, 2.5, 0, 0, 'remember');
      expect(result.newRepetitions).toBe(1);
      expect(result.newInterval).toBe(1);
    });

    it('sets interval to 6 on second successful review', () => {
      const result = calculateNextReview(4, 2.5, 1, 1, 'remember');
      expect(result.newRepetitions).toBe(2);
      expect(result.newInterval).toBe(6);
    });

    it('applies ease factor on third+ review', () => {
      const result = calculateNextReview(5, 2.5, 6, 2, 'remember');
      expect(result.newRepetitions).toBe(3);
      expect(result.newInterval).toBeGreaterThanOrEqual(6);
    });

    it('applies Bloom bonus for higher cognitive levels', () => {
      const remember = calculateNextReview(4, 2.5, 0, 0, 'remember');
      const analyze = calculateNextReview(4, 2.5, 0, 0, 'analyze');
      const create = calculateNextReview(4, 2.5, 0, 0, 'create');

      expect(analyze.newInterval).toBeGreaterThan(remember.newInterval);
      expect(create.newInterval).toBeGreaterThan(analyze.newInterval);
    });

    it('never drops ease factor below 1.3', () => {
      const result = calculateNextReview(0, 1.3, 1, 1, 'remember');
      expect(result.newEaseFactor).toBeGreaterThanOrEqual(1.3);
    });

    it('returns a future nextReviewAt date', () => {
      const result = calculateNextReview(4, 2.5, 1, 1, 'remember');
      expect(result.nextReviewAt.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('scoreToQuality', () => {
    it('maps 95+ to quality 5', () => expect(scoreToQuality(100)).toBe(5));
    it('maps 80-94 to quality 4', () => expect(scoreToQuality(85)).toBe(4));
    it('maps 60-79 to quality 3', () => expect(scoreToQuality(65)).toBe(3));
    it('maps 40-59 to quality 2', () => expect(scoreToQuality(45)).toBe(2));
    it('maps 20-39 to quality 1', () => expect(scoreToQuality(25)).toBe(1));
    it('maps <20 to quality 0', () => expect(scoreToQuality(10)).toBe(0));
  });

  describe('calculateRetentionRate', () => {
    it('returns 0 for empty cards', () => {
      expect(calculateRetentionRate([])).toBe(0);
    });

    it('calculates correct retention rate', () => {
      const cards = [
        { correctReviews: 8, totalReviews: 10 },
        { correctReviews: 6, totalReviews: 10 },
      ] as SRSCard[];
      expect(calculateRetentionRate(cards)).toBe(70);
    });
  });

  describe('getDueCards', () => {
    it('returns cards with past nextReviewAt', () => {
      const cards = [
        { nextReviewAt: new Date(Date.now() - 86400000).toISOString() },
        { nextReviewAt: new Date(Date.now() + 86400000).toISOString() },
      ] as SRSCard[];
      expect(getDueCards(cards)).toHaveLength(1);
    });
  });

  describe('getSRSStats', () => {
    it('returns correct default for empty cards', () => {
      const stats = getSRSStats([]);
      expect(stats.total).toBe(0);
      expect(stats.averageEase).toBe(2.5);
      expect(stats.retentionRate).toBe(0);
    });

    it('classifies cards correctly', () => {
      const cards = [
        { repetitions: 0, intervalDays: 0, nextReviewAt: new Date(Date.now() - 1000).toISOString(), easeFactor: 2.5, correctReviews: 5, totalReviews: 5 },
        { repetitions: 5, intervalDays: 30, nextReviewAt: new Date(Date.now() + 86400000).toISOString(), easeFactor: 2.6, correctReviews: 10, totalReviews: 10 },
      ] as SRSCard[];
      const stats = getSRSStats(cards);
      expect(stats.total).toBe(2);
      expect(stats.learning).toBe(1);
      expect(stats.mature).toBe(1);
      expect(stats.due).toBe(1);
    });
  });
});
