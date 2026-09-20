/**
 * VLD-1.1: Verified Learning Decks Contract
 *
 * A deck may be generated for convenience at any time, but the word VERIFIED
 * and certification-ready claims are reserved for decks that meet the evidence
 * thresholds below. This removes the previous contradiction between zero-gate
 * generation and "generated only after verified reading & assessment" copy.
 */

export const VLD_VERSION = '1.1';

export const VLD_ELIGIBILITY = {
  BASIC_READ_PROGRESS: 0,
  BASIC_QUIZ_REQUIRED: false,

  VERIFIED_CHAPTER_READ_PROGRESS: 80,
  VERIFIED_BOOK_COMPLETION: 80,
  VERIFIED_QUIZ_REQUIRED: true,
  VERIFIED_QUIZ_PASS_RATE: 70,

  MAX_SLIDES_DEFAULT: 15,
  MAX_SLIDES_LIMIT: 25,
  PREMIUM_MAX_SLIDES: 25,
} as const;

export type DeckTier = 'basic' | 'verified';
export type DeckScope = 'chapter' | 'book';
export type TargetAudience = 'student' | 'lecturer' | 'employer' | 'peer-teaching';
export type DeckTone = 'academic' | 'simple' | 'visual' | 'children';
export type SlideType = 'title' | 'learning-objectives' | 'core-concept' | 'application' | 'summary-proof';
export type SlideLayout =
  | 'title-visual'
  | 'learning-objectives'
  | 'concept-text'
  | 'concept-visual'
  | 'diagram-focus'
  | 'comparison'
  | 'example-walkthrough'
  | 'summary-proof';

export interface SlideData {
  type: SlideType;
  layout?: SlideLayout;
  heading: string;
  content: string[];
  sourceReference?: string;
  speakerNotes?: string;
  visual?: {
    type: 'diagram' | 'chart' | 'illustration' | 'icon';
    description?: string;
    url?: string;
    alt?: string;
  };
}

export interface DeckMetadata {
  bookId: string;
  bookVersion: string;
  contentHash: string;
  chaptersCovered: number[];
  generatedAt: string;
  generatedAfterAssessment: boolean;
  scope: DeckScope;
  targetAudience: TargetAudience;
  tone: DeckTone;
}

export interface LearningDeck {
  id: string;
  title: string;
  slides: SlideData[];
  metadata: DeckMetadata;
  isValid: boolean;
  eligibility: DeckEligibility;
}

export interface DeckEligibility {
  isEligible: boolean;
  tier: DeckTier;
  isVerifiedEligible: boolean;
  /** @deprecated use isVerifiedEligible */
  isPremiumEligible: boolean;
  chaptersRead: number[];
  chaptersRequired: number[];
  quizzesAttempted: number[];
  quizzesRequired: number[];
  quizzesPassed: number[];
  readProgress: number;
  hasIntegrityFlags: boolean;
  reason?: string;
  premiumBlocker?: string;
}

export interface DeckGenerationParams {
  scope: DeckScope;
  chapterNumbers?: number[];
  targetAudience: TargetAudience;
  tone: DeckTone;
  maxSlides: number;
  includeVisuals: boolean;
  certificationContext: {
    bookId: string;
    bookVersion: string;
    contentHash: string;
  };
}

export function checkDeckEligibility(
  scope: DeckScope,
  chapterProgress: Map<number, number>,
  quizAttempts: Map<number, boolean>,
  totalChapters: number,
  requestedChapters?: number[],
  hasIntegrityFlags = false,
  quizScores?: Map<number, number>
): DeckEligibility {
  const targetChapters = scope === 'chapter' && requestedChapters
    ? requestedChapters
    : Array.from({ length: totalChapters }, (_, i) => i + 1);

  const chaptersRequired = [...targetChapters];
  const quizzesRequired = [...targetChapters];
  const chaptersRead: number[] = [];
  const quizzesAttempted: number[] = [];
  const quizzesPassed: number[] = [];

  for (const chapterNum of targetChapters) {
    const progress = chapterProgress.get(chapterNum) || 0;
    if (progress >= VLD_ELIGIBILITY.VERIFIED_CHAPTER_READ_PROGRESS) chaptersRead.push(chapterNum);

    if (quizAttempts.get(chapterNum)) {
      quizzesAttempted.push(chapterNum);
      if ((quizScores?.get(chapterNum) || 0) >= VLD_ELIGIBILITY.VERIFIED_QUIZ_PASS_RATE) {
        quizzesPassed.push(chapterNum);
      }
    }
  }

  const readProgress = targetChapters.length > 0
    ? targetChapters.reduce((sum, ch) => sum + (chapterProgress.get(ch) || 0), 0) / targetChapters.length
    : 0;

  // Basic decks are a convenience feature and are not presented as verified proof.
  const isBasicEligible = true;
  const verifiedReadMet = readProgress >= VLD_ELIGIBILITY.VERIFIED_BOOK_COMPLETION;
  const verifiedQuizMet = quizzesPassed.length >= quizzesRequired.length;
  const isVerifiedEligible = verifiedReadMet && verifiedQuizMet && !hasIntegrityFlags;
  const tier: DeckTier = isVerifiedEligible ? 'verified' : 'basic';

  let premiumBlocker: string | undefined;
  if (!isVerifiedEligible) {
    if (hasIntegrityFlags) premiumBlocker = 'Integrity flags detected - verified decks unavailable.';
    else if (!verifiedReadMet) premiumBlocker = `Read at least ${VLD_ELIGIBILITY.VERIFIED_BOOK_COMPLETION}% of the requested content for a verified deck.`;
    else if (!verifiedQuizMet) premiumBlocker = `Pass every required chapter quiz with ${VLD_ELIGIBILITY.VERIFIED_QUIZ_PASS_RATE}%+ for a verified deck.`;
  }

  return {
    isEligible: isBasicEligible,
    tier,
    isVerifiedEligible,
    isPremiumEligible: isVerifiedEligible,
    chaptersRead,
    chaptersRequired,
    quizzesAttempted,
    quizzesRequired,
    quizzesPassed,
    readProgress,
    hasIntegrityFlags,
    premiumBlocker,
  };
}

/**
 * Deterministic local fingerprint for cache invalidation only.
 * It is NOT a cryptographic Contract 12 hash and is deliberately not labelled SHA256.
 */
export function generateContentHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) - hash) + content.charCodeAt(i);
    hash |= 0;
  }
  return `LOCAL:${Math.abs(hash).toString(16).padStart(8, '0')}`;
}

export function validateDeckProvenance(deck: LearningDeck, currentBookHash: string): boolean {
  return Boolean(deck.metadata.contentHash) && deck.metadata.contentHash === currentBookHash;
}

export function createTitleSlide(bookTitle: string, chapterTitles: string[], bookVersion: string): SlideData {
  return {
    type: 'title',
    heading: bookTitle,
    content: [
      ...chapterTitles.map((t, i) => `Chapter ${i + 1}: ${t}`),
      'Learning Deck',
      `Version: ${bookVersion}`,
      'Generated by ScrollLibrary',
    ],
  };
}

export function createObjectivesSlide(objectives: string[]): SlideData {
  return { type: 'learning-objectives', heading: 'Learning Objectives', content: objectives.slice(0, 5) };
}

export function createSummarySlide(
  keyTakeaways: string[],
  metadata: DeckMetadata,
  isVerifiedEligible: boolean
): SlideData {
  const proofLines = isVerifiedEligible
    ? [
        '✓ Verified learning deck: reading, assessment, and integrity requirements passed',
        `Book ID: ${metadata.bookId.slice(0, 8)}...`,
        `Content Hash: ${metadata.contentHash.slice(0, 16)}...`,
        '✓ Certification evidence requirements satisfied',
      ]
    : [
        'Learning aid only — not verified proof of reading or assessment',
        `Book ID: ${metadata.bookId.slice(0, 8)}...`,
        'Complete the verification requirements to create a verified learning deck',
      ];

  return {
    type: 'summary-proof',
    heading: isVerifiedEligible ? 'Summary & Verification' : 'Summary',
    content: [...keyTakeaways, '', '─────────────────', ...proofLines],
  };
}

export const VLD_COPY = {
  title: 'Learning Decks',
  verifiedTitle: 'Verified Learning Decks',
  tagline: "Don't just read. Explain.",
  description: 'Generate a learning deck anytime. Verified status is added only after reading, assessment, and integrity requirements are proven.',
  lockedTitle: 'Verified Status Locked',
  lockedDescription: 'Complete the reading and assessment requirements to earn verified-deck status.',
} as const;
