/**
 * Sentence-Level Highlighter Component
 *
 * Wraps chapter content and renders each sentence as an individual
 * <span> with data-sentence-index for scroll targeting.
 * The active sentence receives a highlight style.
 */

import { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface SentenceHighlighterProps {
  /** Raw plain-text content (markdown already stripped externally) */
  content: string;
  /** Currently active sentence index (-1 = none) */
  activeSentenceIndex: number;
  /** Additional className for the wrapper */
  className?: string;
}

/** Split text into sentences (same logic as useAudioSync) */
function splitSentences(text: string): string[] {
  const raw = text.split(/(?<=[.!?])\s+/);
  return raw.map(s => s.trim()).filter(s => s.length > 0);
}

export function SentenceHighlighter({
  content,
  activeSentenceIndex,
  className,
}: SentenceHighlighterProps) {
  const sentences = useMemo(() => splitSentences(content), [content]);

  return (
    <div className={cn('sentence-highlighter', className)}>
      {sentences.map((sentence, idx) => (
        <span
          key={idx}
          data-sentence-index={idx}
          className={cn(
            'transition-colors duration-200 inline',
            idx === activeSentenceIndex &&
              'bg-primary/20 text-primary-foreground rounded px-0.5 ring-1 ring-primary/30'
          )}
        >
          {sentence}{' '}
        </span>
      ))}
    </div>
  );
}
