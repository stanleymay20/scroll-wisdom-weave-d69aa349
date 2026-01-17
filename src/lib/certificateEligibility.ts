/**
 * CONTRACT 6C — Certificate Eligibility & Issuance Gate
 * 
 * STATUS: LOCKED
 * 
 * Pure eligibility engine that determines IF and WHICH certificate
 * a learner may receive. Consumes outputs from 6A and 6B only.
 * 
 * RULES:
 * - Never modifies detection logic (6B)
 * - Never modifies issuer identity (6A)
 * - Pure function, no side effects
 * - Server-side revalidation required
 */

// ============================================================
// Types from Contract 6B (consumed, not modified)
// ============================================================

/** Integrity score breakdown from assessment tracking */
export interface IntegrityScore {
  overall: number;
  typing: number;
  focus: number;
  timing: number;
  paste: number;
}

/** Classification based on integrity score */
export type IntegrityClassification = 'trusted' | 'review' | 'reject';

/** Integrity thresholds for classification */
export const INTEGRITY_THRESHOLDS = {
  TRUSTED: 0.9,
  REVIEW: 0.6,
} as const;

// ============================================================
// 6C.1 — Certificate Eligibility Result Interface
// ============================================================

export interface CertificateEligibilityResult {
  eligible: boolean;
  certificateType: 'completion' | 'mastery' | null;
  reasons: string[];
  integrityScore: number;
  blockedByCooldown: boolean;
  canRetryAt: Date | null;
}

export interface BookProgress {
  totalChapters: number;
  completedChapters: number;
  quizzesRequired: number;
  quizzesSubmitted: number;
  averageScore: number;
  integrityScore: IntegrityScore;
  integrityClassification: IntegrityClassification;
  hasRejectFlags: boolean;
  hasReviewFlags: boolean;
  masteryRequirementsMet: boolean;
  lastMasteryAttempt: Date | null;
}

// ============================================================
// 6C.2 — Completion Certificate Rules
// ============================================================

const COMPLETION_THRESHOLDS = {
  /** Minimum integrity score for completion certificate */
  MIN_INTEGRITY: 0.6,
  /** All chapters must be completed */
  CHAPTERS_REQUIRED: 1.0, // 100%
  /** All required quizzes must be submitted */
  QUIZZES_REQUIRED: 1.0, // 100%
} as const;

/**
 * Check if learner is eligible for a Completion Certificate
 * 
 * Requirements:
 * - All chapters completed
 * - All required quizzes submitted
 * - No reject integrity flags
 * - Integrity score ≥ 0.6
 */
function checkCompletionEligibility(progress: BookProgress): {
  eligible: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  let eligible = true;

  // Check chapter completion
  const chapterProgress = progress.totalChapters > 0 
    ? progress.completedChapters / progress.totalChapters 
    : 0;
  
  if (chapterProgress < COMPLETION_THRESHOLDS.CHAPTERS_REQUIRED) {
    eligible = false;
    reasons.push(`Complete all chapters (${progress.completedChapters}/${progress.totalChapters})`);
  }

  // Check quiz submission
  const quizProgress = progress.quizzesRequired > 0
    ? progress.quizzesSubmitted / progress.quizzesRequired
    : 1; // No quizzes required = pass
  
  if (quizProgress < COMPLETION_THRESHOLDS.QUIZZES_REQUIRED) {
    eligible = false;
    reasons.push(`Submit all quizzes (${progress.quizzesSubmitted}/${progress.quizzesRequired})`);
  }

  // Check for reject flags
  if (progress.hasRejectFlags) {
    eligible = false;
    reasons.push('Resolve integrity violations before certificate issuance');
  }

  // Check integrity score
  if (progress.integrityScore.overall < COMPLETION_THRESHOLDS.MIN_INTEGRITY) {
    eligible = false;
    reasons.push(`Integrity score too low (${Math.round(progress.integrityScore.overall * 100)}% < 60%)`);
  }

  return { eligible, reasons };
}

// ============================================================
// 6C.3 — Mastery Certificate Rules (STRICT)
// ============================================================

const MASTERY_THRESHOLDS = {
  /** Minimum average score for mastery */
  MIN_SCORE: 0.9, // 90%
  /** Minimum integrity score for mastery */
  MIN_INTEGRITY: 0.9,
  /** Cooldown period after failed mastery attempt (ms) */
  COOLDOWN_MS: 24 * 60 * 60 * 1000, // 24 hours
} as const;

/**
 * Check if learner is eligible for a Mastery Certificate
 * 
 * Requirements (ALL must be met):
 * - Average score ≥ 90%
 * - Integrity score ≥ 0.9
 * - No unresolved review or reject flags
 * - All mastery requirements satisfied
 * - Cooldown respected
 */
function checkMasteryEligibility(progress: BookProgress): {
  eligible: boolean;
  reasons: string[];
  blockedByCooldown: boolean;
  canRetryAt: Date | null;
} {
  const reasons: string[] = [];
  let eligible = true;
  let blockedByCooldown = false;
  let canRetryAt: Date | null = null;

  // 6C.4 — Cooldown Enforcement
  if (progress.lastMasteryAttempt) {
    const cooldownEnd = new Date(progress.lastMasteryAttempt.getTime() + MASTERY_THRESHOLDS.COOLDOWN_MS);
    if (new Date() < cooldownEnd) {
      eligible = false;
      blockedByCooldown = true;
      canRetryAt = cooldownEnd;
      reasons.push(`Mastery attempt locked until ${cooldownEnd.toLocaleString()}`);
    }
  }

  // Check average score
  if (progress.averageScore < MASTERY_THRESHOLDS.MIN_SCORE) {
    eligible = false;
    reasons.push(`Average score below 90% (current: ${Math.round(progress.averageScore * 100)}%)`);
  }

  // Check integrity score (stricter than completion)
  if (progress.integrityScore.overall < MASTERY_THRESHOLDS.MIN_INTEGRITY) {
    eligible = false;
    reasons.push(`Integrity score below 90% (current: ${Math.round(progress.integrityScore.overall * 100)}%)`);
  }

  // Check for any unresolved flags
  if (progress.hasRejectFlags) {
    eligible = false;
    reasons.push('Unresolved integrity violations block mastery certification');
  }

  if (progress.hasReviewFlags) {
    eligible = false;
    reasons.push('Pending review flags must be resolved');
  }

  // Check mastery requirements (from 6B.5)
  if (!progress.masteryRequirementsMet) {
    eligible = false;
    reasons.push('Complete all mastery requirements');
  }

  return { eligible, reasons, blockedByCooldown, canRetryAt };
}

// ============================================================
// 6C.1 — Main Eligibility Engine (Pure Function)
// ============================================================

/**
 * Determine certificate eligibility for a learner
 * 
 * This is a PURE FUNCTION with no side effects.
 * Must be revalidated server-side before issuance.
 * 
 * @param progress - The learner's book progress and integrity data
 * @returns Eligibility result including certificate type or reasons for denial
 */
export function evaluateCertificateEligibility(
  progress: BookProgress
): CertificateEligibilityResult {
  // First, check mastery eligibility (highest tier)
  const masteryResult = checkMasteryEligibility(progress);
  
  if (masteryResult.eligible) {
    return {
      eligible: true,
      certificateType: 'mastery',
      reasons: [],
      integrityScore: progress.integrityScore.overall,
      blockedByCooldown: false,
      canRetryAt: null,
    };
  }

  // If mastery fails, check completion eligibility
  const completionResult = checkCompletionEligibility(progress);
  
  if (completionResult.eligible) {
    // Eligible for completion, but show why mastery was denied
    return {
      eligible: true,
      certificateType: 'completion',
      reasons: masteryResult.reasons, // Show mastery denial reasons as info
      integrityScore: progress.integrityScore.overall,
      blockedByCooldown: masteryResult.blockedByCooldown,
      canRetryAt: masteryResult.canRetryAt,
    };
  }

  // Not eligible for any certificate
  return {
    eligible: false,
    certificateType: null,
    reasons: completionResult.reasons,
    integrityScore: progress.integrityScore.overall,
    blockedByCooldown: masteryResult.blockedByCooldown,
    canRetryAt: masteryResult.canRetryAt,
  };
}

// ============================================================
// 6C.5 — UI Enforcement Helpers
// ============================================================

/**
 * Get display text for certificate eligibility status
 */
export function getEligibilityStatusText(result: CertificateEligibilityResult): string {
  if (result.eligible && result.certificateType === 'mastery') {
    return 'Eligible for Mastery Certificate';
  }
  if (result.eligible && result.certificateType === 'completion') {
    return 'Eligible for Completion Certificate';
  }
  if (result.blockedByCooldown && result.canRetryAt) {
    return `Retry available ${result.canRetryAt.toLocaleDateString()}`;
  }
  return 'Not yet eligible for certification';
}

/**
 * Get color class for eligibility status
 */
export function getEligibilityStatusColor(result: CertificateEligibilityResult): string {
  if (result.eligible && result.certificateType === 'mastery') {
    return 'text-primary';
  }
  if (result.eligible && result.certificateType === 'completion') {
    return 'text-green-600 dark:text-green-400';
  }
  if (result.blockedByCooldown) {
    return 'text-amber-600 dark:text-amber-400';
  }
  return 'text-muted-foreground';
}

/**
 * Check if the "Generate Certificate" button should be enabled
 * 
 * IMPORTANT: This is for UI only. Server-side validation is REQUIRED.
 */
export function shouldEnableCertificateButton(result: CertificateEligibilityResult): boolean {
  return result.eligible && result.certificateType !== null;
}

/**
 * Create empty/default book progress for initial state
 */
export function createDefaultProgress(): BookProgress {
  return {
    totalChapters: 0,
    completedChapters: 0,
    quizzesRequired: 0,
    quizzesSubmitted: 0,
    averageScore: 0,
    integrityScore: {
      overall: 1.0,
      typing: 1.0,
      focus: 1.0,
      timing: 1.0,
      paste: 1.0,
    },
    integrityClassification: 'trusted',
    hasRejectFlags: false,
    hasReviewFlags: false,
    masteryRequirementsMet: false,
    lastMasteryAttempt: null,
  };
}

// ============================================================
// Export thresholds for transparency
// ============================================================

export const ELIGIBILITY_THRESHOLDS = {
  completion: COMPLETION_THRESHOLDS,
  mastery: MASTERY_THRESHOLDS,
} as const;
