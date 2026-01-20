/**
 * MULTI-TIER ASSESSMENT SYSTEM
 * 
 * Tier 1: Knowledge Check (MCQ) - Minor weight
 * Tier 2: Applied Reasoning - Required for certification
 * Tier 3: Scenario & Debugging - Required for certification
 * Tier 4: Integrity-Weighted - For mastery certification
 * 
 * ❌ Certificates MUST NOT be issued using Tier 1 only.
 */

import { AssessmentType } from './assessmentIntegrity';

// ===========================================
// ASSESSMENT TIERS
// ===========================================

export type AssessmentTier = 1 | 2 | 3 | 4;

export interface TierConfig {
  tier: AssessmentTier;
  name: string;
  description: string;
  weight: number; // Weight towards certification
  required: boolean; // Is this tier required for certification?
  questionTypes: AssessmentType[];
  minQuestions: number;
  timeMultiplier: number; // How much longer to allow for these questions
}

export const TIER_CONFIGS: Record<AssessmentTier, TierConfig> = {
  1: {
    tier: 1,
    name: 'Knowledge Check',
    description: 'Basic recall and recognition questions',
    weight: 0.15,
    required: false,
    questionTypes: ['comprehension'],
    minQuestions: 2,
    timeMultiplier: 1
  },
  2: {
    tier: 2,
    name: 'Applied Reasoning',
    description: 'Apply concepts to new situations',
    weight: 0.30,
    required: true,
    questionTypes: ['application', 'analysis'],
    minQuestions: 2,
    timeMultiplier: 1.5
  },
  3: {
    tier: 3,
    name: 'Scenario & Debugging',
    description: 'Fix problems, choose best approaches, analyze cases',
    weight: 0.35,
    required: true,
    questionTypes: ['analysis', 'synthesis'],
    minQuestions: 2,
    timeMultiplier: 2
  },
  4: {
    tier: 4,
    name: 'Integrity-Weighted',
    description: 'Time-based, progressive hints, pattern analysis',
    weight: 0.20,
    required: false, // Required only for mastery certification
    questionTypes: ['evaluation', 'synthesis'],
    minQuestions: 1,
    timeMultiplier: 2.5
  }
};

// ===========================================
// QUESTION TEMPLATES BY TIER
// ===========================================

export interface MultiTierQuestion {
  id: string;
  tier: AssessmentTier;
  type: AssessmentType;
  question: string;
  context?: string;
  options?: string[];
  correctAnswer?: string | number;
  expectedKeywords?: string[];
  codeSnippet?: string;
  expectedOutput?: string;
  hints?: string[];
  pointValue: number;
  timeLimit: number; // seconds
  requiresReasoning: boolean;
  debuggingChallenge: boolean;
}

// Tier 1: Knowledge Check templates
export const TIER1_TEMPLATES = [
  'Which of the following best describes {concept}?',
  'What is the primary purpose of {concept}?',
  'Select all that apply to {concept}:',
  'The {term} is defined as:',
];

// Tier 2: Applied Reasoning templates
export const TIER2_TEMPLATES = [
  'What would happen if you {action}?',
  'Given {scenario}, predict the output:',
  'Why does {behavior} occur when {condition}?',
  'Explain how {concept} applies to {situation}:',
  'Compare and contrast {a} and {b}:',
];

// Tier 3: Scenario & Debugging templates
export const TIER3_TEMPLATES = [
  'The following code contains an error. Identify and fix it:',
  'Which approach would be most efficient for {scenario}? Justify your choice.',
  'Given this case study, what would be the best course of action?',
  'Debug this: {code}. What is wrong and how would you fix it?',
  'A junior developer wrote this code. Identify 2-3 improvements:',
];

// Tier 4: Integrity-Weighted templates
export const TIER4_TEMPLATES = [
  'You have 60 seconds to identify the pattern in this sequence:',
  'Progressive hint: Start with the basic approach, then optimize.',
  'Multi-step problem: Complete each phase before seeing the next.',
  'Time-pressured: Answer within the time limit for full credit.',
];

// ===========================================
// ASSESSMENT BUILDER
// ===========================================

export interface ChapterAssessmentConfig {
  chapterId: string;
  chapterTitle: string;
  bookType: string;
  difficultyLevel: 'beginner' | 'intermediate' | 'advanced';
  isMasteryTrack: boolean;
}

export interface GeneratedAssessment {
  chapterId: string;
  questions: MultiTierQuestion[];
  tierBreakdown: Record<AssessmentTier, number>;
  totalPoints: number;
  estimatedTime: number; // minutes
  certificationEligible: boolean;
  masteryEligible: boolean;
}

/**
 * Validate that an assessment meets certification requirements
 */
export function validateAssessmentForCertification(
  assessment: GeneratedAssessment
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  
  // Check Tier 2 requirement
  const tier2Count = assessment.tierBreakdown[2] || 0;
  if (tier2Count < TIER_CONFIGS[2].minQuestions) {
    issues.push(`Insufficient Tier 2 questions: ${tier2Count} (requires ${TIER_CONFIGS[2].minQuestions})`);
  }
  
  // Check Tier 3 requirement
  const tier3Count = assessment.tierBreakdown[3] || 0;
  if (tier3Count < TIER_CONFIGS[3].minQuestions) {
    issues.push(`Insufficient Tier 3 questions: ${tier3Count} (requires ${TIER_CONFIGS[3].minQuestions})`);
  }
  
  // MCQ-only check
  const tier1Only = tier2Count === 0 && tier3Count === 0 && (assessment.tierBreakdown[1] || 0) > 0;
  if (tier1Only) {
    issues.push('Assessment contains only Tier 1 (MCQ) questions - not acceptable for certification');
  }
  
  // Minimum total questions
  const totalQuestions = assessment.questions.length;
  if (totalQuestions < 5) {
    issues.push(`Insufficient questions: ${totalQuestions} (requires minimum 5)`);
  }

  return {
    valid: issues.length === 0,
    issues
  };
}

/**
 * Validate for mastery certification (stricter requirements)
 */
export function validateAssessmentForMastery(
  assessment: GeneratedAssessment
): { valid: boolean; issues: string[] } {
  const certValidation = validateAssessmentForCertification(assessment);
  const issues = [...certValidation.issues];
  
  // Tier 4 requirement for mastery
  const tier4Count = assessment.tierBreakdown[4] || 0;
  if (tier4Count < TIER_CONFIGS[4].minQuestions) {
    issues.push(`Mastery requires Tier 4 questions: ${tier4Count} (requires ${TIER_CONFIGS[4].minQuestions})`);
  }
  
  // Higher question threshold for mastery
  if (assessment.questions.length < 7) {
    issues.push(`Mastery requires at least 7 questions: ${assessment.questions.length}`);
  }

  return {
    valid: issues.length === 0,
    issues
  };
}

// ===========================================
// ASSESSMENT SCORING WITH TIER WEIGHTS
// ===========================================

export interface TierWeightedScore {
  rawScore: number;
  weightedScore: number;
  tierScores: Record<AssessmentTier, { earned: number; possible: number; weighted: number }>;
  passingThreshold: number;
  masteryThreshold: number;
  passed: boolean;
  masteryAchieved: boolean;
}

/**
 * Calculate tier-weighted score for an assessment
 */
export function calculateTierWeightedScore(
  questions: MultiTierQuestion[],
  answers: Record<string, { answer: string | number; correct: boolean }>
): TierWeightedScore {
  const tierScores: Record<AssessmentTier, { earned: number; possible: number; weighted: number }> = {
    1: { earned: 0, possible: 0, weighted: 0 },
    2: { earned: 0, possible: 0, weighted: 0 },
    3: { earned: 0, possible: 0, weighted: 0 },
    4: { earned: 0, possible: 0, weighted: 0 },
  };

  let totalRawPoints = 0;
  let earnedRawPoints = 0;

  questions.forEach(q => {
    const answer = answers[q.id];
    tierScores[q.tier].possible += q.pointValue;
    totalRawPoints += q.pointValue;
    
    if (answer?.correct) {
      tierScores[q.tier].earned += q.pointValue;
      earnedRawPoints += q.pointValue;
    }
  });

  // Calculate weighted scores per tier
  let totalWeightedScore = 0;
  ([1, 2, 3, 4] as AssessmentTier[]).forEach(tier => {
    const config = TIER_CONFIGS[tier];
    if (tierScores[tier].possible > 0) {
      const tierPercentage = tierScores[tier].earned / tierScores[tier].possible;
      tierScores[tier].weighted = tierPercentage * config.weight * 100;
      totalWeightedScore += tierScores[tier].weighted;
    }
  });

  const rawScore = totalRawPoints > 0 ? (earnedRawPoints / totalRawPoints) * 100 : 0;
  const passingThreshold = 70;
  const masteryThreshold = 90;

  return {
    rawScore,
    weightedScore: totalWeightedScore,
    tierScores,
    passingThreshold,
    masteryThreshold,
    passed: totalWeightedScore >= passingThreshold,
    masteryAchieved: totalWeightedScore >= masteryThreshold
  };
}

// ===========================================
// QUESTION GENERATORS BY TIER
// ===========================================

export function generateTier1Question(concept: string, options: string[], correctIndex: number): MultiTierQuestion {
  return {
    id: `t1_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    tier: 1,
    type: 'comprehension',
    question: `Which of the following best describes ${concept}?`,
    options,
    correctAnswer: correctIndex,
    pointValue: 1,
    timeLimit: 30,
    requiresReasoning: false,
    debuggingChallenge: false
  };
}

export function generateTier2Question(scenario: string, expectedKeywords: string[]): MultiTierQuestion {
  return {
    id: `t2_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    tier: 2,
    type: 'application',
    question: scenario,
    expectedKeywords,
    pointValue: 3,
    timeLimit: 120,
    requiresReasoning: true,
    debuggingChallenge: false
  };
}

export function generateTier3Question(codeSnippet: string, bugDescription: string): MultiTierQuestion {
  return {
    id: `t3_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    tier: 3,
    type: 'analysis',
    question: 'Identify and fix the error in the following code:',
    codeSnippet,
    expectedKeywords: ['fix', 'correct', 'should be'],
    pointValue: 5,
    timeLimit: 180,
    requiresReasoning: true,
    debuggingChallenge: true
  };
}

export function generateTier4Question(challenge: string, hints: string[], timeLimit: number): MultiTierQuestion {
  return {
    id: `t4_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    tier: 4,
    type: 'evaluation',
    question: challenge,
    hints,
    pointValue: 7,
    timeLimit,
    requiresReasoning: true,
    debuggingChallenge: false
  };
}
