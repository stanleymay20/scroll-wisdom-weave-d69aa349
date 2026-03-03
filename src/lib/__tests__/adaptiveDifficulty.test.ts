import { describe, it, expect } from 'vitest';
import {
  computeAdaptiveRecommendation,
  getDifficultyLabel,
  getRecommendedQuestionCount,
  getTimeMultiplier,
  type PerformanceSnapshot,
} from '../adaptiveDifficulty';

describe('Adaptive Difficulty Engine', () => {
  describe('computeAdaptiveRecommendation', () => {
    it('returns default recommendation for empty history', () => {
      const result = computeAdaptiveRecommendation([]);
      expect(result.recommendedDifficulty).toBe(2);
      expect(result.confidence).toBe(0.3);
      expect(result.shouldEscalate).toBe(false);
      expect(result.shouldDeescalate).toBe(false);
    });

    it('escalates on strong performance (avg >= 85)', () => {
      const history: PerformanceSnapshot[] = Array(5).fill({
        score: 90, bloomLevel: 'apply', difficulty: 3,
        timeSpentSeconds: 60, questionsAnswered: 5, createdAt: new Date().toISOString(),
      });
      const result = computeAdaptiveRecommendation(history, 3);
      expect(result.shouldEscalate).toBe(true);
      expect(result.recommendedDifficulty).toBe(4);
    });

    it('de-escalates on poor performance (avg < 50)', () => {
      const history: PerformanceSnapshot[] = Array(3).fill({
        score: 35, bloomLevel: 'remember', difficulty: 3,
        timeSpentSeconds: 120, questionsAnswered: 5, createdAt: new Date().toISOString(),
      });
      const result = computeAdaptiveRecommendation(history, 3);
      expect(result.shouldDeescalate).toBe(true);
      expect(result.recommendedDifficulty).toBe(2);
    });

    it('maintains difficulty on stable moderate scores', () => {
      const history: PerformanceSnapshot[] = Array(3).fill({
        score: 70, bloomLevel: 'apply', difficulty: 3,
        timeSpentSeconds: 60, questionsAnswered: 5, createdAt: new Date().toISOString(),
      });
      const result = computeAdaptiveRecommendation(history, 3);
      expect(result.shouldEscalate).toBe(false);
      expect(result.shouldDeescalate).toBe(false);
      expect(result.recommendedDifficulty).toBe(3);
    });

    it('detects fast guessing (low time + low score)', () => {
      const history: PerformanceSnapshot[] = Array(3).fill({
        score: 30, bloomLevel: 'remember', difficulty: 2,
        timeSpentSeconds: 15, questionsAnswered: 5, createdAt: new Date().toISOString(),
      });
      const result = computeAdaptiveRecommendation(history, 2);
      expect(result.focusAreas).toContain('Spending more time on questions may improve scores');
    });

    it('identifies weak bloom areas', () => {
      const history: PerformanceSnapshot[] = [
        { score: 40, bloomLevel: 'analyze', difficulty: 3, timeSpentSeconds: 60, questionsAnswered: 5, createdAt: new Date().toISOString() },
        { score: 45, bloomLevel: 'analyze', difficulty: 3, timeSpentSeconds: 60, questionsAnswered: 5, createdAt: new Date().toISOString() },
        { score: 90, bloomLevel: 'remember', difficulty: 3, timeSpentSeconds: 60, questionsAnswered: 5, createdAt: new Date().toISOString() },
      ];
      const result = computeAdaptiveRecommendation(history, 3);
      expect(result.focusAreas.some(a => a.includes('analyze'))).toBe(true);
    });

    it('never exceeds difficulty 6 or goes below 1', () => {
      const highHistory: PerformanceSnapshot[] = Array(5).fill({
        score: 100, bloomLevel: 'create', difficulty: 6,
        timeSpentSeconds: 60, questionsAnswered: 5, createdAt: new Date().toISOString(),
      });
      expect(computeAdaptiveRecommendation(highHistory, 6).recommendedDifficulty).toBeLessThanOrEqual(6);

      const lowHistory: PerformanceSnapshot[] = Array(5).fill({
        score: 10, bloomLevel: 'remember', difficulty: 1,
        timeSpentSeconds: 60, questionsAnswered: 5, createdAt: new Date().toISOString(),
      });
      expect(computeAdaptiveRecommendation(lowHistory, 1).recommendedDifficulty).toBeGreaterThanOrEqual(1);
    });

    it('increases confidence with more data', () => {
      const short = computeAdaptiveRecommendation([
        { score: 80, bloomLevel: 'apply', difficulty: 3, timeSpentSeconds: 60, questionsAnswered: 5, createdAt: new Date().toISOString() },
      ]);
      const long = computeAdaptiveRecommendation(
        Array(10).fill({
          score: 80, bloomLevel: 'apply', difficulty: 3,
          timeSpentSeconds: 60, questionsAnswered: 5, createdAt: new Date().toISOString(),
        })
      );
      expect(long.confidence).toBeGreaterThan(short.confidence);
    });
  });

  describe('getDifficultyLabel', () => {
    it('returns correct labels', () => {
      expect(getDifficultyLabel(1)).toBe('Foundational');
      expect(getDifficultyLabel(3)).toBe('Intermediate');
      expect(getDifficultyLabel(6)).toBe('Mastery');
    });

    it('clamps out-of-range values', () => {
      expect(getDifficultyLabel(0)).toBe('Foundational');
      expect(getDifficultyLabel(99)).toBe('Mastery');
    });
  });

  describe('getRecommendedQuestionCount', () => {
    it('returns 5 for low difficulty', () => expect(getRecommendedQuestionCount(1)).toBe(5));
    it('returns 6 for mid difficulty', () => expect(getRecommendedQuestionCount(3)).toBe(6));
    it('returns 7 for high difficulty', () => expect(getRecommendedQuestionCount(5)).toBe(7));
  });

  describe('getTimeMultiplier', () => {
    it('returns 1x at level 1', () => expect(getTimeMultiplier(1)).toBe(1));
    it('returns 2.25x at level 6', () => expect(getTimeMultiplier(6)).toBe(2.25));
  });
});
