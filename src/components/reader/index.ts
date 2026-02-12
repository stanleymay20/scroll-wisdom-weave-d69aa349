export { MarkdownRenderer } from './MarkdownRenderer';
export { ReaderSkeleton } from './ReaderSkeleton';
export { ChapterEditor } from './ChapterEditor';
export { TextHighlighter } from './TextHighlighter';
export { InteractiveQA } from './InteractiveQA';
export { QuizMode } from './QuizMode';
export { GuidedReadingMode } from './GuidedReadingMode';
export { CognitiveLevelSelector } from './CognitiveLevelSelector';
export { VoiceConversation } from './VoiceConversation';
export { StructuredCodeBlock, parseStructuredCodeBlock, hasStructuredCodeBlocks, extractAllStructuredCodeBlocks } from './StructuredCodeBlock';
export type { StructuredCodeBlockData } from './StructuredCodeBlock';
export { CodePlayground, PlaygroundButton } from './CodePlayground';
export { CodingQuizQuestion, type CodingQuestion } from './CodingQuizQuestion';
export { ComicReaderMode, parseComicContentToPanels } from './ComicReaderMode';
export type { ComicPanelData } from './ComicReaderMode';

// Reader settings and floating actions
export { ReaderSettingsPanel, READING_THEMES } from './ReaderSettingsPanel';
export { FloatingActions } from './FloatingActions';
export { ReaderToolsSheet } from './ReaderToolsSheet';
export { DirectTextEditor, DirectEditButton } from './DirectTextEditor';
export { MobileReaderLayout, SwipeHintOverlay } from './MobileReaderLayout';
export { PreviouslyInBookCard } from './PreviouslyInBookCard';
export { ReadingSessionTimer } from './ReadingSessionTimer';
export { SentenceHighlighter } from './SentenceHighlighter';
export { CompetencyLearningPanel } from './CompetencyLearningPanel';
export type { ReadingTheme } from './ReaderSettingsPanel';

// Lazy-loaded panels for performance optimization
export { 
  LazyLearningDeckGenerator,
  LazyDeepResearchPanel,
  LazyCodePlayground,
  LazyComicReaderMode,
  LazyVoiceConversation,
  withLazySuspense
} from './LazyReaderPanels';

// Contract 9 - Illustrated Content Components (ICG-1.0)
export { IllustratedImage, ImageExpander, ChartExplainer } from './illustrated';
export type { 
  IllustratedImageProps, 
  ImageExpanderProps, 
  ChartExplainerProps,
  IllustratedContentProps 
} from './illustrated';