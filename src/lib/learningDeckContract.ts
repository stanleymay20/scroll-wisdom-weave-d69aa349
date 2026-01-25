/**
 * VLD-1.0: Verified Learning Decks Contract
 * 
 * Governs slide-generation from books with strict eligibility rules.
 * Learning decks are tied to reading progress, assessment completion, and integrity.
 */

export const VLD_VERSION = '1.0';

// Eligibility thresholds
export const VLD_ELIGIBILITY = {
  CHAPTER_READ_PROGRESS: 80,   // % of chapter that must be read
  BOOK_CHAPTER_COMPLETION: 80, // % of book chapters that must be completed
  QUIZ_ATTEMPT_REQUIRED: true, // Quiz must be attempted (pass not required)
  MAX_SLIDES_DEFAULT: 10,
  MAX_SLIDES_LIMIT: 15,
} as const;

// Deck scope types
export type DeckScope = 'chapter' | 'book';

// Target audience affects tone and complexity
export type TargetAudience = 'student' | 'lecturer' | 'employer' | 'peer-teaching';

// Tone presets
export type DeckTone = 'academic' | 'simple' | 'visual' | 'children';

// Slide types
export type SlideType = 
  | 'title'
  | 'learning-objectives'
  | 'core-concept'
  | 'application'
  | 'summary-proof';

// Slide layout types (NotebookLM-quality layouts)
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
  layout?: SlideLayout; // Layout template to use
  heading: string;
  content: string[];
  sourceReference?: string; // "Chapter X, Section Y"
  speakerNotes?: string; // Optional presenter notes
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
  chaptersRead: number[];
  chaptersRequired: number[];
  quizzesAttempted: number[];
  quizzesRequired: number[];
  readProgress: number;
  hasIntegrityFlags: boolean;
  reason?: string;
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

/**
 * Check if user is eligible to generate a learning deck
 */
export function checkDeckEligibility(
  scope: DeckScope,
  chapterProgress: Map<number, number>, // chapter number -> read progress %
  quizAttempts: Map<number, boolean>,   // chapter number -> quiz attempted
  totalChapters: number,
  requestedChapters?: number[],
  hasIntegrityFlags = false
): DeckEligibility {
  const chaptersRead: number[] = [];
  const chaptersRequired: number[] = [];
  const quizzesAttempted: number[] = [];
  const quizzesRequired: number[] = [];

  // Determine which chapters are required
  const targetChapters = scope === 'chapter' && requestedChapters 
    ? requestedChapters 
    : Array.from({ length: totalChapters }, (_, i) => i + 1);

  for (const chapterNum of targetChapters) {
    chaptersRequired.push(chapterNum);
    quizzesRequired.push(chapterNum);

    const progress = chapterProgress.get(chapterNum) || 0;
    if (progress >= VLD_ELIGIBILITY.CHAPTER_READ_PROGRESS) {
      chaptersRead.push(chapterNum);
    }

    if (quizAttempts.get(chapterNum)) {
      quizzesAttempted.push(chapterNum);
    }
  }

  // Calculate overall read progress
  const totalProgress = targetChapters.reduce((sum, ch) => sum + (chapterProgress.get(ch) || 0), 0);
  const readProgress = totalProgress / targetChapters.length;

  // Check eligibility
  const allChaptersRead = chaptersRequired.every(ch => chaptersRead.includes(ch));
  const allQuizzesAttempted = quizzesRequired.every(ch => quizzesAttempted.includes(ch));
  
  // For book scope, need 80% of chapters complete
  const bookScopeOk = scope === 'chapter' || 
    (chaptersRead.length / totalChapters) >= (VLD_ELIGIBILITY.BOOK_CHAPTER_COMPLETION / 100);

  const isEligible = allChaptersRead && allQuizzesAttempted && bookScopeOk && !hasIntegrityFlags;

  // Determine reason if not eligible
  let reason: string | undefined;
  if (hasIntegrityFlags) {
    reason = 'Active integrity flags detected. Please contact support.';
  } else if (!allChaptersRead) {
    const missing = chaptersRequired.filter(ch => !chaptersRead.includes(ch));
    reason = `Read ${VLD_ELIGIBILITY.CHAPTER_READ_PROGRESS}% of chapter(s) ${missing.join(', ')} to unlock.`;
  } else if (!allQuizzesAttempted) {
    const missing = quizzesRequired.filter(ch => !quizzesAttempted.includes(ch));
    reason = `Attempt quiz for chapter(s) ${missing.join(', ')} to unlock.`;
  } else if (!bookScopeOk) {
    reason = `Complete ${VLD_ELIGIBILITY.BOOK_CHAPTER_COMPLETION}% of book chapters to generate full-book deck.`;
  }

  return {
    isEligible,
    chaptersRead,
    chaptersRequired,
    quizzesAttempted,
    quizzesRequired,
    readProgress,
    hasIntegrityFlags,
    reason,
  };
}

/**
 * Generate content hash for provenance binding (browser-compatible)
 */
export function generateContentHash(content: string): string {
  // Simple hash for browser - creates a deterministic fingerprint
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  const hexHash = Math.abs(hash).toString(16).padStart(8, '0');
  return `SHA256:${hexHash}${btoa(content.slice(0, 24)).replace(/[^a-zA-Z0-9]/g, '').slice(0, 24)}`;
}

/**
 * Validate deck against book content (provenance check)
 */
export function validateDeckProvenance(
  deck: LearningDeck,
  currentBookHash: string
): boolean {
  return deck.metadata.contentHash === currentBookHash;
}

/**
 * Create title slide
 */
export function createTitleSlide(
  bookTitle: string,
  chapterTitles: string[],
  bookVersion: string
): SlideData {
  return {
    type: 'title',
    heading: bookTitle,
    content: [
      ...chapterTitles.map((t, i) => `Chapter ${i + 1}: ${t}`),
      'Verified Learning Deck',
      `Version: ${bookVersion}`,
      'Generated by ScrollLibrary',
    ],
  };
}

/**
 * Create learning objectives slide
 */
export function createObjectivesSlide(objectives: string[]): SlideData {
  return {
    type: 'learning-objectives',
    heading: 'Learning Objectives',
    content: objectives.slice(0, 5), // Max 5 objectives
  };
}

/**
 * Create summary slide with provenance proof
 */
export function createSummarySlide(
  keyTakeaways: string[],
  metadata: DeckMetadata,
  isCertificateEligible: boolean
): SlideData {
  return {
    type: 'summary-proof',
    heading: 'Summary & Verification',
    content: [
      ...keyTakeaways,
      '',
      '─────────────────',
      '✓ This deck was generated after verified reading & assessment',
      `Book ID: ${metadata.bookId.slice(0, 8)}...`,
      `Content Hash: ${metadata.contentHash.slice(0, 16)}...`,
      isCertificateEligible 
        ? '✓ Certificate Eligible' 
        : '○ Complete all assessments for certification',
    ],
  };
}

// Copy for UI
export const VLD_COPY = {
  title: 'Verified Learning Decks',
  tagline: "Don't just read. Explain.",
  description: 
    'These slides are generated only after verified reading and assessment — making them trusted proof of learning, not AI shortcuts.',
  lockedTitle: 'Deck Locked',
  lockedDescription: 'Complete the reading requirements to generate your learning deck.',
} as const;
