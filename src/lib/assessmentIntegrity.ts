/**
 * CONTRACT 6B — AI-RESILIENT ASSESSMENTS & ANTI-CHEATING LOGIC
 * Status: CORE · HARD-ENFORCED
 * 
 * This contract ensures certificates remain credible by:
 * 1. Detecting AI-assisted answers
 * 2. Enforcing time-based validation
 * 3. Requiring mastery-level understanding for certain certificates
 * 4. Preventing bulk copy-paste submissions
 */

// ===========================================
// 6B.1 — ASSESSMENT TYPES
// ===========================================

export type AssessmentType = 
  | 'comprehension'     // Basic understanding check
  | 'application'       // Apply concepts to scenarios
  | 'analysis'          // Break down and examine
  | 'synthesis'         // Create new from learned
  | 'evaluation';       // Judge and critique

export interface AssessmentQuestion {
  id: string;
  type: AssessmentType;
  question: string;
  options?: string[];
  correctAnswer?: string | number;
  expectedKeywords?: string[];
  minWordCount?: number;
  maxWordCount?: number;
  timeLimit?: number; // seconds
  difficulty: 'easy' | 'medium' | 'hard';
  chapterId: string;
  bookId: string;
}

export interface AssessmentResponse {
  questionId: string;
  answer: string | number;
  startTime: Date;
  endTime: Date;
  typingPattern?: TypingPattern;
  pasteDetected: boolean;
  focusLostCount: number;
}

// ===========================================
// 6B.2 — AI DETECTION SIGNALS
// ===========================================

export interface TypingPattern {
  averageKeystrokeInterval: number; // ms between keystrokes
  totalKeystrokes: number;
  deleteCount: number;
  pasteEvents: number;
  burstTyping: boolean; // Unusually fast typing
  consistentRhythm: boolean; // AI-like consistent timing
}

export interface AIDetectionResult {
  isLikelyAI: boolean;
  confidence: number; // 0-1
  signals: AISignal[];
  recommendation: 'accept' | 'review' | 'reject';
}

export interface AISignal {
  type: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  weight: number;
}

/**
 * Detect AI-assisted responses based on behavioral patterns
 */
export function detectAIAssistance(
  response: AssessmentResponse,
  question: AssessmentQuestion
): AIDetectionResult {
  const signals: AISignal[] = [];
  let totalWeight = 0;

  // 1. Time Analysis
  const responseTime = (response.endTime.getTime() - response.startTime.getTime()) / 1000;
  const answerLength = typeof response.answer === 'string' ? response.answer.length : 0;
  
  // Too fast for the content length (superhuman typing)
  if (answerLength > 100 && responseTime < 10) {
    signals.push({
      type: 'SUPERHUMAN_SPEED',
      description: `${answerLength} characters in ${responseTime}s suggests copy-paste`,
      severity: 'high',
      weight: 0.4,
    });
    totalWeight += 0.4;
  }

  // 2. Paste Detection
  if (response.pasteDetected) {
    signals.push({
      type: 'PASTE_DETECTED',
      description: 'Content was pasted rather than typed',
      severity: 'high',
      weight: 0.35,
    });
    totalWeight += 0.35;
  }

  // 3. Typing Pattern Analysis
  if (response.typingPattern) {
    const { averageKeystrokeInterval, consistentRhythm, burstTyping, deleteCount, totalKeystrokes } = response.typingPattern;
    
    // AI-like consistent rhythm (humans are irregular)
    if (consistentRhythm && averageKeystrokeInterval > 50 && averageKeystrokeInterval < 150) {
      signals.push({
        type: 'ROBOTIC_TYPING',
        description: 'Typing rhythm is unusually consistent',
        severity: 'medium',
        weight: 0.15,
      });
      totalWeight += 0.15;
    }

    // No corrections (humans make mistakes)
    if (totalKeystrokes > 50 && deleteCount === 0) {
      signals.push({
        type: 'PERFECT_TYPING',
        description: 'No corrections made during long response',
        severity: 'low',
        weight: 0.1,
      });
      totalWeight += 0.1;
    }

    // Burst typing pattern
    if (burstTyping) {
      signals.push({
        type: 'BURST_TYPING',
        description: 'Content arrived in sudden bursts',
        severity: 'medium',
        weight: 0.2,
      });
      totalWeight += 0.2;
    }
  }

  // 4. Focus Loss Analysis
  if (response.focusLostCount > 3) {
    signals.push({
      type: 'EXCESSIVE_TAB_SWITCHING',
      description: `Focus lost ${response.focusLostCount} times during response`,
      severity: 'medium',
      weight: 0.15,
    });
    totalWeight += 0.15;
  }

  // 5. Content Quality vs Time (if essay)
  if (typeof response.answer === 'string' && question.type !== 'comprehension') {
    const wordCount = response.answer.split(/\s+/).filter(w => w.length > 0).length;
    const wordsPerSecond = wordCount / responseTime;
    
    // Average typing is 40 WPM = 0.67 WPS, over 2 WPS is suspicious
    if (wordsPerSecond > 2) {
      signals.push({
        type: 'IMPOSSIBLE_SPEED',
        description: `${wordsPerSecond.toFixed(1)} words/second exceeds human capability`,
        severity: 'high',
        weight: 0.4,
      });
      totalWeight += 0.4;
    }
  }

  // Determine recommendation
  const confidence = Math.min(totalWeight, 1);
  let recommendation: 'accept' | 'review' | 'reject';
  
  if (confidence >= 0.7) {
    recommendation = 'reject';
  } else if (confidence >= 0.4) {
    recommendation = 'review';
  } else {
    recommendation = 'accept';
  }

  return {
    isLikelyAI: confidence >= 0.5,
    confidence,
    signals,
    recommendation,
  };
}

// ===========================================
// 6B.3 — ASSESSMENT SCORING
// ===========================================

export interface AssessmentScore {
  totalQuestions: number;
  correctAnswers: number;
  partialCredit: number;
  percentageScore: number;
  passingThreshold: number;
  passed: boolean;
  masteryAchieved: boolean;
  integrityScore: number; // 0-1, based on AI detection
  flags: string[];
}

/**
 * Calculate assessment score with integrity weighting
 */
export function calculateAssessmentScore(
  responses: AssessmentResponse[],
  questions: AssessmentQuestion[],
  aiDetectionResults: AIDetectionResult[]
): AssessmentScore {
  let correctAnswers = 0;
  let partialCredit = 0;
  const flags: string[] = [];

  // Calculate raw score
  responses.forEach((response, index) => {
    const question = questions.find(q => q.id === response.questionId);
    if (!question) return;

    if (question.options && question.correctAnswer !== undefined) {
      // Multiple choice
      if (response.answer === question.correctAnswer) {
        correctAnswers++;
      }
    } else if (question.expectedKeywords && typeof response.answer === 'string') {
      // Essay with keywords
      const answer = response.answer.toLowerCase();
      const matchedKeywords = question.expectedKeywords.filter(kw => 
        answer.includes(kw.toLowerCase())
      );
      const keywordScore = matchedKeywords.length / question.expectedKeywords.length;
      
      if (keywordScore >= 0.8) {
        correctAnswers++;
      } else if (keywordScore >= 0.5) {
        partialCredit += 0.5;
      } else if (keywordScore >= 0.3) {
        partialCredit += 0.25;
      }
    }
  });

  // Calculate integrity score from AI detection
  const avgConfidence = aiDetectionResults.reduce((sum, r) => sum + r.confidence, 0) / aiDetectionResults.length;
  const integrityScore = 1 - avgConfidence;

  // Flag suspicious responses
  aiDetectionResults.forEach((result, index) => {
    if (result.recommendation === 'reject') {
      flags.push(`Question ${index + 1}: AI assistance detected`);
    } else if (result.recommendation === 'review') {
      flags.push(`Question ${index + 1}: Requires manual review`);
    }
  });

  const rawScore = correctAnswers + partialCredit;
  const percentageScore = (rawScore / questions.length) * 100;
  
  // Apply integrity penalty
  const adjustedScore = percentageScore * integrityScore;
  
  const passingThreshold = 70;
  const masteryThreshold = 90;

  return {
    totalQuestions: questions.length,
    correctAnswers,
    partialCredit,
    percentageScore: adjustedScore,
    passingThreshold,
    passed: adjustedScore >= passingThreshold,
    masteryAchieved: adjustedScore >= masteryThreshold && integrityScore >= 0.9,
    integrityScore,
    flags,
  };
}

// ===========================================
// 6B.4 — ANTI-CHEATING RULES
// ===========================================

export interface AntiCheatConfig {
  enablePasteDetection: boolean;
  enableFocusTracking: boolean;
  enableTypingAnalysis: boolean;
  enableTimeTracking: boolean;
  maxAllowedPastes: number;
  maxAllowedFocusLoss: number;
  minResponseTime: number; // seconds
  requireProctoring: boolean;
}

export const DEFAULT_ANTI_CHEAT_CONFIG: AntiCheatConfig = {
  enablePasteDetection: true,
  enableFocusTracking: true,
  enableTypingAnalysis: true,
  enableTimeTracking: true,
  maxAllowedPastes: 1,
  maxAllowedFocusLoss: 5,
  minResponseTime: 5,
  requireProctoring: false,
};

export const STRICT_ANTI_CHEAT_CONFIG: AntiCheatConfig = {
  enablePasteDetection: true,
  enableFocusTracking: true,
  enableTypingAnalysis: true,
  enableTimeTracking: true,
  maxAllowedPastes: 0,
  maxAllowedFocusLoss: 2,
  minResponseTime: 10,
  requireProctoring: true,
};

/**
 * Validate response against anti-cheat rules
 */
export function validateAgainstAntiCheat(
  response: AssessmentResponse,
  config: AntiCheatConfig
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];

  // Paste check
  if (config.enablePasteDetection && response.pasteDetected) {
    if (config.maxAllowedPastes === 0) {
      violations.push('Pasting is not allowed during this assessment');
    }
  }

  // Focus loss check
  if (config.enableFocusTracking && response.focusLostCount > config.maxAllowedFocusLoss) {
    violations.push(`Focus lost ${response.focusLostCount} times (max: ${config.maxAllowedFocusLoss})`);
  }

  // Minimum time check
  if (config.enableTimeTracking) {
    const responseTime = (response.endTime.getTime() - response.startTime.getTime()) / 1000;
    if (responseTime < config.minResponseTime) {
      violations.push(`Response submitted too quickly (${responseTime.toFixed(1)}s < ${config.minResponseTime}s)`);
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

// ===========================================
// 6B.5 — MASTERY REQUIREMENTS
// ===========================================

export interface MasteryRequirement {
  minScore: number;
  minIntegrityScore: number;
  requiresAllChapterQuizzes: boolean;
  requiresApplicationQuestions: boolean;
  requiresAnalysisQuestions: boolean;
  cooldownBetweenAttempts: number; // hours
}

export const MASTERY_REQUIREMENTS: MasteryRequirement = {
  minScore: 90,
  minIntegrityScore: 0.9,
  requiresAllChapterQuizzes: true,
  requiresApplicationQuestions: true,
  requiresAnalysisQuestions: true,
  cooldownBetweenAttempts: 24,
};

/**
 * Check if user qualifies for mastery certificate
 */
export function checkMasteryEligibility(
  scores: AssessmentScore[],
  requirements: MasteryRequirement = MASTERY_REQUIREMENTS
): { eligible: boolean; reasons: string[] } {
  const reasons: string[] = [];

  // Check average score
  const avgScore = scores.reduce((sum, s) => sum + s.percentageScore, 0) / scores.length;
  if (avgScore < requirements.minScore) {
    reasons.push(`Average score ${avgScore.toFixed(1)}% below ${requirements.minScore}% threshold`);
  }

  // Check average integrity
  const avgIntegrity = scores.reduce((sum, s) => sum + s.integrityScore, 0) / scores.length;
  if (avgIntegrity < requirements.minIntegrityScore) {
    reasons.push(`Integrity score ${(avgIntegrity * 100).toFixed(1)}% below ${requirements.minIntegrityScore * 100}% threshold`);
  }

  // Check for flags
  const totalFlags = scores.reduce((sum, s) => sum + s.flags.length, 0);
  if (totalFlags > 0) {
    reasons.push(`${totalFlags} assessment(s) flagged for review`);
  }

  return {
    eligible: reasons.length === 0,
    reasons,
  };
}

// ===========================================
// 6B.6 — RESPONSE TRACKING UTILITIES
// ===========================================

export function createTypingTracker() {
  let keystrokes: number[] = [];
  let deleteCount = 0;
  let pasteEvents = 0;

  return {
    recordKeystroke: (timestamp: number) => {
      keystrokes.push(timestamp);
    },
    recordDelete: () => {
      deleteCount++;
    },
    recordPaste: () => {
      pasteEvents++;
    },
    getPattern: (): TypingPattern => {
      // Calculate average interval
      let totalInterval = 0;
      for (let i = 1; i < keystrokes.length; i++) {
        totalInterval += keystrokes[i] - keystrokes[i - 1];
      }
      const avgInterval = keystrokes.length > 1 ? totalInterval / (keystrokes.length - 1) : 0;

      // Check for consistent rhythm (low variance)
      let variance = 0;
      for (let i = 1; i < keystrokes.length; i++) {
        const interval = keystrokes[i] - keystrokes[i - 1];
        variance += Math.pow(interval - avgInterval, 2);
      }
      const stdDev = keystrokes.length > 1 ? Math.sqrt(variance / (keystrokes.length - 1)) : 0;
      const consistentRhythm = stdDev < 50; // Low variance = robotic

      // Check for burst typing (many keystrokes in short time)
      let burstTyping = false;
      for (let i = 0; i < keystrokes.length - 10; i++) {
        const window = keystrokes[i + 10] - keystrokes[i];
        if (window < 500) { // 10 keystrokes in 500ms = burst
          burstTyping = true;
          break;
        }
      }

      return {
        averageKeystrokeInterval: avgInterval,
        totalKeystrokes: keystrokes.length,
        deleteCount,
        pasteEvents,
        burstTyping,
        consistentRhythm,
      };
    },
    reset: () => {
      keystrokes = [];
      deleteCount = 0;
      pasteEvents = 0;
    },
  };
}
