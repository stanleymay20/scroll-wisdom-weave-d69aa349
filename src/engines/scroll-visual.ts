/**
 * ScrollVisual Engine
 * ====================
 * Visual Intelligence System with cognitive value scoring
 * and book-type-aware rendering.
 *
 * Owns: Figure detection, classification, rendering, covers
 */

// ─── Figure Rendering ────────────────────────────────────
export { FigureRenderer } from '@/components/reader/FigureRenderer';

// ─── Illustrated Content Components (Contract 9) ─────────
export {
  IllustratedImage,
  ImageExpander,
  ChartExplainer,
} from '@/components/reader/illustrated';

// ─── Comic Visual Components ─────────────────────────────
export {
  ComicReaderMode,
  parseComicContentToPanels,
} from '@/components/reader/ComicReaderMode';

export {
  DialogueBubble,
  LearningHighlight,
  PanelNavigator,
  PanelView,
  ProgressIndicator,
} from '@/components/reader/comic';

// ─── Cover Generation ────────────────────────────────────
export { CoverUpload } from '@/components/books/CoverUpload';

// ─── Visual Contracts ────────────────────────────────────
export { validateStyleConsistency } from '@/lib/visualStyleConsistency';

// ─── Instructional Visuals ───────────────────────────────
export { InstructionalVisual } from '@/components/decks/InstructionalVisual';
