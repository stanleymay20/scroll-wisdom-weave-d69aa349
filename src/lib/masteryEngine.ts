/**
 * MASTERY ENGINE v2.0 — Institution-Ready
 * 
 * Bloom-weighted certification gates, anti-gaming, suspicious input detection,
 * coding exercise validation, and institutional mode enforcement.
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
  suspiciousInputDetected?: boolean;
  codingPassRate?: number | null;
  executionError?: string | null;
  integrityFlags?: Record<string, unknown>;
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

export interface RemediationPlan {
  weakestLevel: BloomLevel;
  recommendedActions: string[];
  targetQuestionCount: number;
  focusLevels: BloomLevel[];
  certificationLocked: boolean;
  lockReasons: string[];
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
  remediation: RemediationPlan | null;
  weakestBloomLevel: BloomLevel | null;
  recommendedDifficulty: number;
  codingPassRate: number;
  hasSuspiciousFlags: boolean;
  bloomLevelsAssessed: number;
  integrityScore: number;
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

/** Required minimum distribution for quiz generation */
export const BLOOM_DISTRIBUTION_REQUIREMENTS = {
  remember: { max: 25 },
  understand: { max: 25 },
  apply: { min: 20 },
  analyze: { min: 20 },
  evaluate: { min: 5 },
  create: { min: 5 },
} as const;

export const MASTERY_THRESHOLDS = {
  MIN_OVERALL: 80,
  MIN_APPLY_ANALYZE: 70,
  EVALUATE_REQUIRED: true,
  DEVELOPING_MAX: 59,
  PROFICIENT_MIN: 60,
  PROFICIENT_MAX: 84,
  MASTERY_MIN: 85,
  MIN_BLOOM_LEVELS: 3,
  MIN_CODING_PASS_RATE: 60,
} as const;

export const ANTI_GAMING = {
  MIN_TIME_PER_ATTEMPT: 60,
  MAX_RETAKES_PER_DAY: 5,
  ESCALATION_AFTER_ATTEMPTS: 3,
  MIN_QUESTIONS: 3,
  /** Characters entered in under this many ms is suspicious */
  SUSPICIOUS_TYPING_CHARS: 30,
  SUSPICIOUS_TYPING_MS: 200,
  /** Score volatility threshold (std dev) */
  VOLATILITY_THRESHOLD: 25,
} as const;

export const INSTITUTIONAL_MODE = {
  MAX_RETAKES_PER_DAY: 3,
  MIN_TIME_PER_ATTEMPT: 120,
  CODING_REQUIRED: true,
  EVALUATE_MANDATORY: true,
  CERTIFICATE_LABEL: 'Institutional Mastery Record',
} as const;

// ============================================================
// Core Scoring Logic
// ============================================================

export function classifyMastery(score: number): MasteryStatus {
  if (score >= MASTERY_THRESHOLDS.MASTERY_MIN) return 'mastery';
  if (score >= MASTERY_THRESHOLDS.PROFICIENT_MIN) return 'proficient';
  return 'developing';
}

export function calculateImprovementDelta(currentScore: number, previousScore: number | null): number {
  if (previousScore === null) return 0;
  return Math.round((currentScore - previousScore) * 100) / 100;
}

export function calculateGrowthTrend(scores: number[]): GrowthTrend {
  if (scores.length < 2) return 'improving';
  
  const recent = scores.slice(-3);
  const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length;
  const older = scores.slice(-6, -3);
  
  if (older.length === 0) {
    const isImproving = recent.length >= 2 && recent[recent.length - 1] > recent[0];
    return isImproving ? 'improving' : 'plateau';
  }
  
  const avgOlder = older.reduce((a, b) => a + b, 0) / older.length;
  const delta = avgRecent - avgOlder;
  
  if (delta > 3) return 'improving';
  if (delta < -3) return 'declining';
  return 'plateau';
}

export function aggregateBloomDistribution(attempts: LearningAttempt[]): BloomDistribution {
  const dist: BloomDistribution = { remember: 0, understand: 0, apply: 0, analyze: 0, evaluate: 0, create: 0 };
  const counts: Record<BloomLevel, number> = { remember: 0, understand: 0, apply: 0, analyze: 0, evaluate: 0, create: 0 };
  
  for (const attempt of attempts) {
    dist[attempt.bloomLevel] += attempt.score;
    counts[attempt.bloomLevel]++;
  }
  
  for (const level of BLOOM_LEVELS) {
    dist[level] = counts[level] > 0 ? Math.round(dist[level] / counts[level]) : 0;
  }
  
  return dist;
}

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

export function calculateRecommendedDifficulty(
  attempts: LearningAttempt[],
  currentDifficulty: number
): number {
  if (attempts.length === 0) return 1;
  
  const recentAttempts = attempts.slice(-3);
  const avgScore = recentAttempts.reduce((sum, a) => sum + a.score, 0) / recentAttempts.length;
  
  if (avgScore >= 80 && currentDifficulty < 6) {
    return Math.min(currentDifficulty + 1, 6);
  }
  
  if (avgScore < 50 && currentDifficulty > 1) {
    return Math.max(currentDifficulty - 1, 1);
  }
  
  return currentDifficulty;
}

// ============================================================
// Score Volatility Detection
// ============================================================

export function detectScoreVolatility(scores: number[]): boolean {
  if (scores.length < 4) return false;
  const recent = scores.slice(-6);
  const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
  const variance = recent.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / recent.length;
  const stdDev = Math.sqrt(variance);
  return stdDev > ANTI_GAMING.VOLATILITY_THRESHOLD;
}

// ============================================================
// Remediation Engine
// ============================================================

export function generateRemediationPlan(
  assessment: { bloomDistribution: BloomDistribution; blockReasons: string[] },
  weakestLevel: BloomLevel | null
): RemediationPlan {
  const focusLevels: BloomLevel[] = [];
  const recommendedActions: string[] = [];
  
  if (!weakestLevel) {
    return {
      weakestLevel: 'remember',
      recommendedActions: ['Complete initial assessments to identify focus areas'],
      targetQuestionCount: 5,
      focusLevels: ['apply', 'analyze'],
      certificationLocked: true,
      lockReasons: assessment.blockReasons,
    };
  }

  // Identify all weak levels (below 60)
  for (const level of BLOOM_LEVELS) {
    if (assessment.bloomDistribution[level] < 60) {
      focusLevels.push(level);
    }
  }

  if (focusLevels.length === 0) focusLevels.push(weakestLevel);

  // Generate targeted actions
  recommendedActions.push(`Weakest Cognitive Level: ${weakestLevel.charAt(0).toUpperCase() + weakestLevel.slice(1)}`);
  recommendedActions.push(`Complete ${Math.max(2, focusLevels.length)} targeted exercises at the ${weakestLevel} level`);
  
  if (!focusLevels.includes('apply') && assessment.bloomDistribution.apply < 70) {
    recommendedActions.push('Complete 1 application problem to strengthen practical reasoning');
  }
  if (!focusLevels.includes('analyze') && assessment.bloomDistribution.analyze < 70) {
    recommendedActions.push('Complete 1 analytical question to strengthen critical thinking');
  }

  return {
    weakestLevel,
    recommendedActions,
    targetQuestionCount: Math.max(3, focusLevels.length * 2),
    focusLevels,
    certificationLocked: true,
    lockReasons: assessment.blockReasons,
  };
}

// ============================================================
// Full Mastery Assessment
// ============================================================

export function assessMastery(
  attempts: LearningAttempt[],
  options?: { institutionalMode?: boolean; requireCoding?: boolean }
): MasteryAssessment {
  const blockReasons: string[] = [];
  const isInstitutional = options?.institutionalMode ?? false;
  
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
      remediation: null,
      weakestBloomLevel: null,
      recommendedDifficulty: 1,
      codingPassRate: 0,
      hasSuspiciousFlags: false,
      bloomLevelsAssessed: 0,
      integrityScore: 1.0,
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
  
  // Coding pass rate
  const codingAttempts = attempts.filter(a => a.codingPassRate != null);
  const codingPassRate = codingAttempts.length > 0
    ? codingAttempts.reduce((sum, a) => sum + (a.codingPassRate ?? 0), 0) / codingAttempts.length
    : 0;

  // Suspicious flags
  const hasSuspiciousFlags = attempts.some(a => a.suspiciousInputDetected);
  
  // Bloom levels assessed
  const bloomLevelsUsed = new Set(attempts.map(a => a.bloomLevel));
  const bloomLevelsAssessed = bloomLevelsUsed.size;

  // Integrity score (penalize suspicious attempts)
  const cleanAttempts = attempts.filter(a => !a.suspiciousInputDetected).length;
  const integrityScore = attempts.length > 0 ? cleanAttempts / attempts.length : 1.0;

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
  
  // 4. No declining trend
  if (attempts.length > 1 && trend === 'declining') {
    certReady = false;
    blockReasons.push('Declining performance trend detected — remediation required');
  }
  
  // 5. ≥2 attempts unless first-attempt mastery
  if (attempts.length < 2 && overallScore < MASTERY_THRESHOLDS.MASTERY_MIN) {
    certReady = false;
    blockReasons.push('Minimum 2 attempts required (unless first-attempt mastery)');
  }
  
  // 6. ≥3 Bloom levels assessed
  if (bloomLevelsAssessed < MASTERY_THRESHOLDS.MIN_BLOOM_LEVELS) {
    certReady = false;
    blockReasons.push(`Only ${bloomLevelsAssessed} Bloom levels assessed — minimum 3 required`);
  }

  // 7. No suspicious input
  if (hasSuspiciousFlags) {
    certReady = false;
    blockReasons.push('Suspicious input detected — integrity review required');
  }

  // 8. Score volatility check
  if (detectScoreVolatility(scores)) {
    certReady = false;
    blockReasons.push('Unstable mastery detected — score volatility exceeds threshold');
  }

  // 9. Coding pass rate (if coding attempts exist or required)
  if (options?.requireCoding || codingAttempts.length > 0) {
    if (codingPassRate < MASTERY_THRESHOLDS.MIN_CODING_PASS_RATE) {
      certReady = false;
      blockReasons.push(`Coding pass rate ${Math.round(codingPassRate)}% is below ${MASTERY_THRESHOLDS.MIN_CODING_PASS_RATE}% threshold`);
    }
  }

  // 10. Institutional mode extra checks
  if (isInstitutional) {
    if (!hasEvaluate) {
      blockReasons.push('Institutional mode requires Evaluate-level success');
    }
    if (codingAttempts.length === 0 && INSTITUTIONAL_MODE.CODING_REQUIRED) {
      certReady = false;
      blockReasons.push('Institutional mode requires at least 1 coding exercise');
    }
  }
  
  const remediationNeeded = !certReady;
  const remediation = remediationNeeded 
    ? generateRemediationPlan({ bloomDistribution: bloomDist, blockReasons }, weakest)
    : null;
  
  return {
    overallScore,
    bloomDistribution: bloomDist,
    masteryStatus,
    improvementTrend: trend,
    attemptCount: attempts.length,
    certificationReady: certReady,
    blockReasons,
    remediationNeeded,
    remediation,
    weakestBloomLevel: weakest,
    recommendedDifficulty,
    codingPassRate,
    hasSuspiciousFlags,
    bloomLevelsAssessed,
    integrityScore,
  };
}

// ============================================================
// Anti-Gaming Validation
// ============================================================

export function validateAttemptIntegrity(
  timeSpentSeconds: number,
  questionsAnswered: number,
  attemptsToday: number,
  options?: { institutionalMode?: boolean; suspiciousInput?: boolean }
): { valid: boolean; reason?: string } {
  const minTime = options?.institutionalMode 
    ? INSTITUTIONAL_MODE.MIN_TIME_PER_ATTEMPT 
    : ANTI_GAMING.MIN_TIME_PER_ATTEMPT;
  const maxRetakes = options?.institutionalMode
    ? INSTITUTIONAL_MODE.MAX_RETAKES_PER_DAY
    : ANTI_GAMING.MAX_RETAKES_PER_DAY;

  if (timeSpentSeconds < minTime) {
    return { valid: false, reason: `Minimum ${minTime}s required per attempt` };
  }
  
  if (attemptsToday >= maxRetakes) {
    return { valid: false, reason: `Maximum ${maxRetakes} attempts per 24 hours` };
  }
  
  if (questionsAnswered < ANTI_GAMING.MIN_QUESTIONS) {
    return { valid: false, reason: `Minimum ${ANTI_GAMING.MIN_QUESTIONS} questions required` };
  }

  if (options?.suspiciousInput) {
    return { valid: false, reason: 'Suspicious input detected — attempt marked as invalid' };
  }
  
  return { valid: true };
}

/**
 * Detect suspicious typing burst (>30 chars in <200ms)
 */
export function detectSuspiciousTyping(
  charCount: number,
  timeMs: number
): boolean {
  return charCount >= ANTI_GAMING.SUSPICIOUS_TYPING_CHARS && 
         timeMs < ANTI_GAMING.SUSPICIOUS_TYPING_MS;
}

// ============================================================
// Mastery Hash (Extended)
// ============================================================

export async function generateMasteryHash(
  userId: string,
  bookId: string,
  finalScore: number,
  bloomDistribution: BloomDistribution,
  attemptCount: number,
  codingPassRate: number,
  timestamp: string
): Promise<string> {
  const bloomStr = BLOOM_LEVELS.map(l => `${l}:${bloomDistribution[l]}`).join(',');
  const payload = `${userId}|${bookId}|${finalScore}|${bloomStr}|${attemptCount}|${codingPassRate}|${timestamp}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(payload);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
