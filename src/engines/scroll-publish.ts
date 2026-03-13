/**
 * ScrollPublish Engine
 * =====================
 * Professional export, typesetting, and publishing-ready
 * artifact generation.
 *
 * Owns: PDF/EPUB/DOCX export, covers, figure embedding, TTS
 */

// ─── Export System ───────────────────────────────────────
export { ExportDialog } from '@/components/books/ExportDialog';
export { EXPORT_FORMATS } from '@/lib/config';
export type { ExportFormat } from '@/lib/config';
export { exportValidation } from '@/lib/exportValidation';

// ─── Book Presentation ──────────────────────────────────
export { BookCard } from '@/components/books/BookCard';
export { BookDetailHeader } from '@/components/books/BookDetailHeader';
export { LibraryBookCard } from '@/components/books/LibraryBookCard';
export { ShareDialog } from '@/components/books/ShareDialog';
export { BookOwnerControls } from '@/components/books/BookOwnerControls';

// ─── Text-to-Speech / Audio ──────────────────────────────
export { TextToSpeechPlayer } from '@/components/audio/TextToSpeechPlayer';
export { TTSMiniPlayer } from '@/components/audio/TTSMiniPlayer';
export { VoiceConversation } from '@/components/reader/VoiceConversation';
export { useAudioReliability } from '@/hooks/useAudioReliability';
export { useMediaSession } from '@/hooks/useMediaSession';

// ─── Video Generation ────────────────────────────────────
export { ChapterVideoGenerator } from '@/components/reader/ChapterVideoGenerator';

// ─── Learning Deck Export ────────────────────────────────
export { SlideViewer } from '@/components/decks/SlideViewer';
export { exportLearningDeck } from '@/lib/exportLearningDeck';

// ─── Reader Experience ───────────────────────────────────
export { ReaderSettingsPanel } from '@/components/reader/ReaderSettingsPanel';
export { FloatingActions } from '@/components/reader/FloatingActions';
export { MobileReaderLayout } from '@/components/reader/MobileReaderLayout';
export { PreviouslyInBookCard } from '@/components/reader/PreviouslyInBookCard';
export { SentenceHighlighter } from '@/components/reader/SentenceHighlighter';
