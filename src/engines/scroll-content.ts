/**
 * ScrollContent Engine
 * ====================
 * Book-type-aware content generation with multi-pass intellectual pipeline.
 *
 * Owns: Generation, editing, document processing, chapter management
 */

// ─── Configuration ───────────────────────────────────────
export { FEATURES, LAUNCH_MODE_CONFIG } from '@/lib/config';
export { bookTypeGovernance } from '@/lib/bookTypeGovernance';

// ─── Generation UI Components ────────────────────────────
export {
  BookTypeSelector,
  WorkbookPreview,
  ComicStyleSelector,
  BestsellerModeToggle,
  BestsellerQAScore,
  AuthorImprint,
  ComicSubTypeSelector,
  ComicCharacterSheet,
  ComicLearningObjectives,
  CharacterPortraitPreview,
  FictionWritingTools,
} from '@/components/generate';

// ─── Reader / Editor Components ──────────────────────────
export {
  MarkdownRenderer,
  ChapterEditor,
  DirectTextEditor,
  StructuredCodeBlock,
} from '@/components/reader';

// ─── Chapter Management ─────────────────────────────────
export { ChapterList, ChapterManagement } from '@/components/books';

// ─── Academic Mode ───────────────────────────────────────
export { ContentModeSelector } from '@/components/academic/ContentModeSelector';
export { AcademicModeIndicator } from '@/components/academic/AcademicModeIndicator';
export { AcademicDisclaimer } from '@/components/academic/AcademicDisclaimer';

// ─── Content Determinism & Validation ────────────────────
export { contentDeterminism } from '@/lib/contentDeterminism';
export { validateContract3 } from '@/lib/contract3Validation';

// ─── API Layer ───────────────────────────────────────────
export { api } from '@/lib/api';
