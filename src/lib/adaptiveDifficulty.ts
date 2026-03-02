/**
 * ADAPTIVE DIFFICULTY ENGINE
 * 
 * Dynamically adjusts question difficulty based on:
 * 1. Recent performance (sliding window of last 5 attempts)
 * 2. Bloom level progression
 * 3. Time-spent patterns
 * 4. Streak behavior
 * 
 * Difficulty scale: 1 (beginner) → 6 (expert)
 */

import { type BloomLevel, BLOOM_LEVELS } from './masteryEngine';

export interface PerformanceSnapshot {
  score: number;
  bloomLevel: BloomLevel;
  difficulty: number;
  timeSpentSeconds: number;
  questionsAnswered: number;
  createdAt: string;
}

export interface AdaptiveRecommendation {
  recommendedDifficulty: number;
  recommendedBloomLevel: BloomLevel;
  reason: string;
  confidence: number; // 0-1
  focusAreas: string[];
  shouldEscalate: boolean;
  shouldDeescalate: boolean;
}

const DIFFICULTY_LABELS: Record<number, string> = {
  1: 'Foundational',
  2: 'Developing',
  3: 'Intermediate',
  4: 'Advanced',
  5: 'Expert',
  6: 'Mastery',
};

export function getDifficultyLabel(level: number): string {
  return DIFFICULTY_LABELS[Math.min(6, Math.max(1, level))] || 'Intermediate';
}

/**
 * Core adaptive algorithm — analyzes recent performance and recommends next difficulty
 */
export function computeAdaptiveRecommendation(
  history: PerformanceSnapshot[],
  currentDifficulty: number = 3
): AdaptiveRecommendation {
  if (history.length === 0) {
    return {
      recommendedDifficulty: 2,
      recommendedBloomLevel: 'understand',
      reason: 'Starting with foundational assessment to calibrate difficulty',
      confidence: 0.3,
      focusAreas: [],
      shouldEscalate: false,
      shouldDeescalate: false,
    };
  }

  const recent = history.slice(-5);
  const avgScore = recent.reduce((s, h) => s + h.score, 0) / recent.length;
  const avgTime = recent.reduce((s, h) => s + h.timeSpentSeconds, 0) / recent.length;
  const lastScore = recent[recent.length - 1].score;

  // Trend analysis
  const scores = recent.map(h => h.score);
  const isImproving = scores.length >= 3 && scores[scores.length - 1] > scores[0] + 5;
  const isDeclining = scores.length >= 3 && scores[scores.length - 1] < scores[0] - 10;

  // Bloom level progression
  const bloomIndex = (level: BloomLevel) => BLOOM_LEVELS.indexOf(level);
  const highestBloom = recent.reduce((max, h) => 
    bloomIndex(h.bloomLevel) > bloomIndex(max) ? h.bloomLevel : max, 
    recent[0].bloomLevel
  );
  const highestBloomIdx = bloomIndex(highestBloom);

  // Confidence based on data volume
  const confidence = Math.min(1, history.length / 10);

  // Difficulty adjustment logic
  let newDifficulty = currentDifficulty;
  let shouldEscalate = false;
  let shouldDeescalate = false;
  let reason = '';
  const focusAreas: string[] = [];

  // Strong performance → escalate
  if (avgScore >= 85 && lastScore >= 80) {
    shouldEscalate = true;
    newDifficulty = Math.min(6, currentDifficulty + 1);
    reason = `Strong performance (avg ${Math.round(avgScore)}%) — escalating difficulty`;
  }
  // Consistent mastery at current level → escalate
  else if (avgScore >= 75 && isImproving && recent.length >= 3) {
    shouldEscalate = true;
    newDifficulty = Math.min(6, currentDifficulty + 1);
    reason = `Improving trend with solid scores — ready for next level`;
  }
  // Struggling → de-escalate
  else if (avgScore < 50 && recent.length >= 2) {
    shouldDeescalate = true;
    newDifficulty = Math.max(1, currentDifficulty - 1);
    reason = `Scores below 50% — reducing difficulty to build confidence`;
  }
  // Declining trend → de-escalate
  else if (isDeclining && avgScore < 65) {
    shouldDeescalate = true;
    newDifficulty = Math.max(1, currentDifficulty - 1);
    reason = `Declining trend detected — stepping back to reinforce`;
  }
  // Stable but not strong enough → maintain
  else {
    reason = `Scores stable at ${Math.round(avgScore)}% — maintaining current difficulty`;
  }

  // Recommend Bloom level based on performance + difficulty
  let recommendedBloom: BloomLevel;
  if (newDifficulty <= 2) {
    recommendedBloom = avgScore >= 70 ? 'apply' : 'understand';
  } else if (newDifficulty <= 4) {
    recommendedBloom = avgScore >= 75 ? 'analyze' : 'apply';
  } else {
    recommendedBloom = avgScore >= 80 ? 'evaluate' : 'analyze';
  }

  // Identify focus areas (bloom levels with low scores)
  const bloomScores: Record<string, { total: number; count: number }> = {};
  for (const h of history) {
    if (!bloomScores[h.bloomLevel]) bloomScores[h.bloomLevel] = { total: 0, count: 0 };
    bloomScores[h.bloomLevel].total += h.score;
    bloomScores[h.bloomLevel].count++;
  }
  for (const [level, data] of Object.entries(bloomScores)) {
    const avg = data.total / data.count;
    if (avg < 60) focusAreas.push(`${level} (${Math.round(avg)}%)`);
  }

  // Speed-based adjustment: if answering too fast with low scores, might be guessing
  if (avgTime < 30 && avgScore < 50) {
    focusAreas.push('Spending more time on questions may improve scores');
  }

  return {
    recommendedDifficulty: newDifficulty,
    recommendedBloomLevel: recommendedBloom,
    reason,
    confidence,
    focusAreas,
    shouldEscalate,
    shouldDeescalate,
  };
}

/**
 * Get question count recommendation based on difficulty
 */
export function getRecommendedQuestionCount(difficulty: number): number {
  if (difficulty <= 2) return 5;
  if (difficulty <= 4) return 6;
  return 7;
}

/**
 * Get time multiplier for difficulty level
 */
export function getTimeMultiplier(difficulty: number): number {
  return 1 + (difficulty - 1) * 0.25; // 1x at level 1, 2.25x at level 6
}
