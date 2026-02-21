/**
 * MASTERY ENGINE — Longitudinal Scoring, Adaptive Retake, and Anti-Gaming Logic
 * 
 * Transforms certification from pass/fail → structured competency progression.
 * All logic is deterministic and reproducible.
 */

// ============================================================
// Types
// ============================================================

export type BloomLevel = 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create';
export type MasteryStatus = 'developing' | 'proficient' | 'mastery';
export type GrowthTrend = 'improving' | 'plateau' | 'declining';

export interface LearningAttempt {
  id?: string;
  userId: string;
  bookId: string;
  chapterId?: string;
  attemptNumber: number;
  bloomLevel: BloomLevel;
  score: number;
  questionDifficulty: number;
  improvementDelta: number;
  masteryStatus: MasteryStatus;
  remediationTriggered: boolean;
  timeSpentSeconds: number;
  questionsAnswered: number;
  createdAt?: string;
}

export interface BloomDistribution {
  remember: number;
  understand: number;
  apply: number;
  analyze: number;
  evaluate: number;
  create: number;
}

export interface MasteryAssessment {
  overallScore: number;
  bloomDistribution: BloomDistribution;
  masteryStatus: MasteryStatus;
  improvementTrend: GrowthTrend;
  attemptCount: number;
  certificationReady: boolean;
  blockReasons: string[];
  remediationNeeded: boolean;
  weakestBloomLevel: BloomLevel | null;
  recommendedDifficulty: number;
}

// ============================================================
// Constants
// ============================================================

export const BLOOM_LEVELS: BloomLevel[] = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'];
export const BLOOM_WEIGHTS: Record<BloomLevel, number> = {
  remember: 0.10,
  understand: 0.15,
  apply: 0.20,
  analyze: 0.25,
  evaluate: 0.20,
  create: 0.10,
};

export const MASTERY_THRESHOLDS = {
  /** Overall score ≥ 80% for certification */
  MIN_OVERALL: 80,
  /** Apply + Analyze combined ≥ 70% */
  MIN_APPLY_ANALYZE: 70,
  /** At least one Evaluate-level success */
  EVALUATE_REQUIRED: true,
  /** Score thresholds for mastery levels */
  DEVELOPING_MAX: 59,
  PROFICIENT_MIN: 60,
  PROFICIENT_MAX: 84,
  MASTERY_MIN: 85,
} as const;

export const ANTI_GAMING = {
  /** Minimum seconds per attempt */
  MIN_TIME_PER_ATTEMPT: 60,
  /** Max retakes per 24 hours */
  MAX_RETAKES_PER_DAY: 5,
  /** Difficulty escalation after N attempts */
  ESCALATION_AFTER_ATTEMPTS: 3,
  /** Min questions for valid attempt */
  MIN_QUESTIONS: 3,
} as const;

// ============================================================
// Core Scoring Logic
// ============================================================

/**
 * Calculate mastery status from a score
 */
export function classifyMastery(score: number): MasteryStatus {
  if (score >= MASTERY_THRESHOLDS.MASTERY_MIN) return 'mastery';
  if (score >= MASTERY_THRESHOLDS.PROFICIENT_MIN) return 'proficient';
  return 'developing';
}

/**
 * Calculate improvement delta between attempts
 */
export function calculateImprovementDelta(currentScore: number, previousScore: number | null): number {
  if (previousScore === null) return 0;
  return Math.round((currentScore - previousScore) * 100) / 100;
}

/**
 * Determine growth trend from a series of scores
 */
export function calculateGrowthTrend(scores: number[]): GrowthTrend {
  if (scores.length < 2) return 'improving';
  
  const recent = scores.slice(-3);
  const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length;
  const older = scores.slice(-6, -3);
  
  if (older.length === 0) {
    // Only recent data: check if trending up
    const isImproving = recent.length >= 2 && recent[recent.length - 1] > recent[0];
    return isImproving ? 'improving' : 'plateau';
  }
  
  const avgOlder = older.reduce((a, b) => a + b, 0) / older.length;
  const delta = avgRecent - avgOlder;
  
  if (delta > 3) return 'improving';
  if (delta < -3) return 'declining';
  return 'plateau';
}

/**
 * Aggregate Bloom distribution from multiple attempts
 */
export function aggregateBloomDistribution(attempts: LearningAttempt[]): BloomDistribution {
  const dist: BloomDistribution = { remember: 0, understand: 0, apply: 0, analyze: 0, evaluate: 0, create: 0 };
  const counts: Record<BloomLevel, number> = { remember: 0, understand: 0, apply: 0, analyze: 0, evaluate: 0, create: 0 };
  
  for (const attempt of attempts) {
    dist[attempt.bloomLevel] += attempt.score;
    counts[attempt.bloomLevel]++;
  }
  
  // Average per level
  for (const level of BLOOM_LEVELS) {
    dist[level] = counts[level] > 0 ? Math.round(dist[level] / counts[level]) : 0;
  }
  
  return dist;
}

/**
 * Find the weakest Bloom level from distribution
 */
export function findWeakestBloom(dist: BloomDistribution): BloomLevel | null {
  let weakest: BloomLevel | null = null;
  let lowestScore = Infinity;
  
  for (const level of BLOOM_LEVELS) {
    if (dist[level] < lowestScore) {
      lowestScore = dist[level];
      weakest = level;
    }
  }
  
  return weakest;
}

/**
 * Calculate recommended difficulty based on performance
 */
export function calculateRecommendedDifficulty(
  attempts: LearningAttempt[],
  currentDifficulty: number
): number {
  if (attempts.length === 0) return 1;
  
  const recentAttempts = attempts.slice(-3);
  const avgScore = recentAttempts.reduce((sum, a) => sum + a.score, 0) / recentAttempts.length;
  
  // Improve → increase difficulty
  if (avgScore >= 80 && currentDifficulty < 6) {
    return Math.min(currentDifficulty + 1, 6);
  }
  
  // Regress → decrease difficulty
  if (avgScore < 50 && currentDifficulty > 1) {
    return Math.max(currentDifficulty - 1, 1);
  }
  
  return currentDifficulty;
}

// ============================================================
// Full Mastery Assessment
// ============================================================

/**
 * Comprehensive mastery assessment for certification readiness
 */
export function assessMastery(attempts: LearningAttempt[]): MasteryAssessment {
  const blockReasons: string[] = [];
  
  if (attempts.length === 0) {
    return {
      overallScore: 0,
      bloomDistribution: { remember: 0, understand: 0, apply: 0, analyze: 0, evaluate: 0, create: 0 },
      masteryStatus: 'developing',
      improvementTrend: 'improving',
      attemptCount: 0,
      certificationReady: false,
      blockReasons: ['No assessment attempts recorded'],
      remediationNeeded: false,
      weakestBloomLevel: null,
      recommendedDifficulty: 1,
    };
  }

  const bloomDist = aggregateBloomDistribution(attempts);
  const scores = attempts.map(a => a.score);
  const trend = calculateGrowthTrend(scores);
  
  // Weighted overall score
  let overallScore = 0;
  for (const level of BLOOM_LEVELS) {
    overallScore += bloomDist[level] * BLOOM_WEIGHTS[level];
  }
  overallScore = Math.round(overallScore);
  
  const masteryStatus = classifyMastery(overallScore);
  const weakest = findWeakestBloom(bloomDist);
  const currentDifficulty = attempts[attempts.length - 1]?.questionDifficulty ?? 1;
  const recommendedDifficulty = calculateRecommendedDifficulty(attempts, currentDifficulty);
  
  // Certification gate checks
  let certReady = true;
  
  // 1. Overall ≥ 80%
  if (overallScore < MASTERY_THRESHOLDS.MIN_OVERALL) {
    certReady = false;
    blockReasons.push(`Overall score ${overallScore}% is below 80% threshold`);
  }
  
  // 2. Apply + Analyze combined ≥ 70%
  const applyAnalyze = (bloomDist.apply + bloomDist.analyze) / 2;
  if (applyAnalyze < MASTERY_THRESHOLDS.MIN_APPLY_ANALYZE) {
    certReady = false;
    blockReasons.push(`Apply + Analyze average ${Math.round(applyAnalyze)}% is below 70% threshold`);
  }
  
  // 3. At least one Evaluate-level success
  const hasEvaluate = attempts.some(a => a.bloomLevel === 'evaluate' && a.score >= 60);
  if (!hasEvaluate) {
    certReady = false;
    blockReasons.push('No successful Evaluate-level assessment recorded');
  }
  
  // 4. Positive improvement OR first-attempt mastery
  if (attempts.length > 1 && trend === 'declining') {
    certReady = false;
    blockReasons.push('Declining performance trend detected — remediation required');
  }
  
  // 5. Self-audit checks
  if (attempts.length < 2 && overallScore < MASTERY_THRESHOLDS.MASTERY_MIN) {
    // Need ≥2 attempts unless first-attempt mastery
    certReady = false;
    blockReasons.push('Minimum 2 attempts required (unless first-attempt mastery)');
  }
  
  // Question set diversity check
  const bloomLevelsUsed = new Set(attempts.map(a => a.bloomLevel));
  if (bloomLevelsUsed.size < 3) {
    certReady = false;
    blockReasons.push(`Only ${bloomLevelsUsed.size} Bloom levels assessed — minimum 3 required`);
  }
  
  const remediationNeeded = !certReady && overallScore < MASTERY_THRESHOLDS.MIN_OVERALL;
  
  return {
    overallScore,
    bloomDistribution: bloomDist,
    masteryStatus,
    improvementTrend: trend,
    attemptCount: attempts.length,
    certificationReady: certReady,
    blockReasons,
    remediationNeeded,
    weakestBloomLevel: weakest,
    recommendedDifficulty,
  };
}

// ============================================================
// Anti-Gaming Validation
// ============================================================

/**
 * Validate attempt against anti-gaming rules
 */
export function validateAttemptIntegrity(
  timeSpentSeconds: number,
  questionsAnswered: number,
  attemptsToday: number
): { valid: boolean; reason?: string } {
  if (timeSpentSeconds < ANTI_GAMING.MIN_TIME_PER_ATTEMPT) {
    return { valid: false, reason: `Minimum ${ANTI_GAMING.MIN_TIME_PER_ATTEMPT}s required per attempt` };
  }
  
  if (attemptsToday >= ANTI_GAMING.MAX_RETAKES_PER_DAY) {
    return { valid: false, reason: `Maximum ${ANTI_GAMING.MAX_RETAKES_PER_DAY} attempts per 24 hours` };
  }
  
  if (questionsAnswered < ANTI_GAMING.MIN_QUESTIONS) {
    return { valid: false, reason: `Minimum ${ANTI_GAMING.MIN_QUESTIONS} questions required` };
  }
  
  return { valid: true };
}

/**
 * Generate SHA-256 hash for mastery certification
 */
export async function generateMasteryHash(
  userId: string,
  bookId: string,
  finalScore: number,
  timestamp: string
): Promise<string> {
  const payload = `${userId}|${bookId}|${finalScore}|${timestamp}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(payload);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
