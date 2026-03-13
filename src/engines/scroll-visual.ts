/**
 * ScrollVisual Engine
 * ====================
 * Visual Intelligence System with cognitive value scoring
 * and book-type-aware rendering.
 *
 * Owns: Figure detection, classification, rendering, covers
 */

// ─── Figure Rendering ────────────────────────────────────
export { FigureRenderer, RenderModeBadge } from '@/components/reader/FigureRenderer';
export type { RenderMode, FigureRendererProps } from '@/components/reader/FigureRenderer';

// ─── Visual Renderer Library ─────────────────────────────
export { MermaidDiagram, descriptionToMermaid } from '@/components/reader/visuals/MermaidDiagram';
export { DataChart } from '@/components/reader/visuals/DataChart';
export { ComparisonTable } from '@/components/reader/visuals/ComparisonTable';

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
