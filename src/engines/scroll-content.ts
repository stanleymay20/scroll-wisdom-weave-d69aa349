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
// Direct exports preserve route-level lazy loading. Importing the reader barrel
// here would eagerly pull optional reader tools into the main application chunk.
export { MarkdownRenderer } from '@/components/reader/MarkdownRenderer';
export { ChapterEditor } from '@/components/reader/ChapterEditor';
export { DirectTextEditor } from '@/components/reader/DirectTextEditor';
export { StructuredCodeBlock } from '@/components/reader/StructuredCodeBlock';

// ─── Chapter Management ─────────────────────────────────
export { ChapterManagement } from '@/components/books/ChapterManagement';

// ─── Academic Mode ───────────────────────────────────────
export { ContentModeSelector } from '@/components/academic/ContentModeSelector';
export { AcademicModeIndicator } from '@/components/academic/AcademicModeIndicator';
export { AcademicDisclaimer } from '@/components/academic/AcademicDisclaimer';

// ─── Content Determinism & Validation ────────────────────
export { ContentDeterminism } from '@/lib/contentDeterminism';
