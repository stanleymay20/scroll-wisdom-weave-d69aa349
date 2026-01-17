/**
 * CONTRACT 6B — ASSESSMENT INTEGRITY COMPONENTS
 * AI-Resilient Assessments & Anti-Cheating Logic
 */

export { IntegrityShield, IntegrityWarning } from './IntegrityShield';

export {
  detectAIAssistance,
  validateAgainstAntiCheat,
  calculateAssessmentScore,
  checkMasteryEligibility,
  createTypingTracker,
  DEFAULT_ANTI_CHEAT_CONFIG,
  STRICT_ANTI_CHEAT_CONFIG,
  MASTERY_REQUIREMENTS,
} from '@/lib/assessmentIntegrity';

export {
  useAssessmentIntegrity,
  useSimpleQuizValidation,
} from '@/hooks/useAssessmentIntegrity';

export type {
  AssessmentType,
  AssessmentQuestion,
  AssessmentResponse,
  AIDetectionResult,
  AISignal,
  AssessmentScore,
  AntiCheatConfig,
  TypingPattern,
  MasteryRequirement,
} from '@/lib/assessmentIntegrity';
