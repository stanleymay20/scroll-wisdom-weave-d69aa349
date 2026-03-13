/**
 * ScrollContent Engine
 * ====================
 * Book-type-aware content generation with multi-pass intellectual pipeline.
 *
 * Owns: Generation, editing, document processing, chapter management
 */

// ─── Configuration ───────────────────────────────────────
export { FEATURES, LAUNCH_MODE_CONFIG } from '@/lib/config';

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
export { ChapterManagement } from '@/components/books/ChapterManagement';

// ─── Academic Mode ───────────────────────────────────────
export { ContentModeSelector } from '@/components/academic/ContentModeSelector';
export { AcademicModeIndicator } from '@/components/academic/AcademicModeIndicator';
export { AcademicDisclaimer } from '@/components/academic/AcademicDisclaimer';

// ─── Content Determinism & Validation ────────────────────
export { ContentDeterminism } from '@/lib/contentDeterminism';
