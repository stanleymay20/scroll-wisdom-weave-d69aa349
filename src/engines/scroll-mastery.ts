/**
 * ScrollMastery Engine
 * =====================
 * Competency verification with Bloom enforcement,
 * spaced repetition, and adaptive difficulty.
 *
 * Owns: Assessment, quizzes, SRS, learning analytics, certification
 */

// ─── Assessment Components ───────────────────────────────
export { QuizMode } from '@/components/reader/QuizMode';
export { InteractiveQA } from '@/components/reader/InteractiveQA';
export { CodingQuizQuestion } from '@/components/reader/CodingQuizQuestion';
export { CodingExercise } from '@/components/reader/CodingExercise';
export { CognitiveLevelSelector } from '@/components/reader/CognitiveLevelSelector';
export { RemediationPanel } from '@/components/reader/RemediationPanel';
export { AdaptiveLearningPath } from '@/components/reader/AdaptiveLearningPath';
export { CompetencyLearningPanel } from '@/components/reader/CompetencyLearningPanel';
export { GuidedReadingMode } from '@/components/reader/GuidedReadingMode';

// ─── Assessment Integrity ────────────────────────────────
export { IntegrityShield } from '@/components/assessment/IntegrityShield';
export {
  detectAIAssistance,
  validateAgainstAntiCheat,
  calculateAssessmentScore,
  checkMasteryEligibility,
  createTypingTracker,
} from '@/lib/assessmentIntegrity';

// ─── Mastery Engine Core ─────────────────────────────────
export { masteryEngine } from '@/lib/masteryEngine';
export { multiTierAssessment } from '@/lib/multiTierAssessment';
export { assessmentRigorContract } from '@/lib/assessmentRigorContract';

// ─── Spaced Repetition ───────────────────────────────────
export { useSpacedRepetition } from '@/hooks/useSpacedRepetition';

// ─── Adaptive Difficulty ─────────────────────────────────
export { useAdaptiveDifficulty } from '@/hooks/useAdaptiveDifficulty';

// ─── Competency & Progress ───────────────────────────────
export { useCompetencyProgress } from '@/hooks/useCompetencyProgress';
export { useMasteryProgress } from '@/hooks/useMasteryProgress';
export { useQuizGating } from '@/hooks/useQuizGating';

// ─── Flashcards & Learning Decks ─────────────────────────
export { FlashcardDeck } from '@/components/decks/FlashcardDeck';
export { FlashcardGenerator } from '@/components/decks/FlashcardGenerator';
export { LearningDeckGenerator } from '@/components/decks/LearningDeckGenerator';
export { useSavedDecks } from '@/hooks/useSavedDecks';

// ─── Reading Analytics ───────────────────────────────────
export { ReadingSessionTimer } from '@/components/reader/ReadingSessionTimer';
export { useReadingSession } from '@/hooks/useReadingSession';
export { ReadingProgressDashboard } from '@/components/dashboard/ReadingProgressDashboard';

// ─── Certificates ────────────────────────────────────────
export {
  CertificateDisplay,
  CertificateGenerator,
  CertificateStatusPanel,
  CompetencyManifestDisplay,
  CertifiedBookSeal,
} from '@/components/certificates';

export {
  createCertificate,
  generateVerificationHash,
  validateCertificateIntegrity,
} from '@/lib/certificateAuthority';

export { certificateEligibility } from '@/lib/certificateEligibility';
export { competencyCertification } from '@/lib/competencyCertification';
export { competencyManifest } from '@/lib/competencyManifest';
