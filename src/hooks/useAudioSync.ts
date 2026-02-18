/**
 * Chunk-Aware Word-Level Audio Synchronization Hook
 *
 * Instead of estimating global timestamps (which drift as duration estimates change),
 * this uses per-chunk interpolation: audio.currentTime / audio.duration within the
 * currently-playing chunk to precisely locate the active word.
 *
 * Architecture:
 * 1. DOM walk assigns data-word-index to every word span
 * 2. TTSMiniPlayer reports: current chunk index + word counts per chunk
 * 3. Tick loop: fraction = audio.currentTime / audio.duration
 *    → wordInChunk = floor(fraction * wordsInChunk)
 *    → globalWordIndex = chunkWordOffset + wordInChunk
 * 4. Highlight + smooth scroll to active word
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

export interface SentenceTimestamp {
  index: number;
  text: string;
  startTime: number;
  endTime: number;
}

export interface ChunkPlaybackInfo {
  chunkIndex: number;
  chunkWordCounts: number[];
}

interface UseAudioSyncOptions {
  chapterContent: string | null;
  isPlaying: boolean;
  contentRef: React.RefObject<HTMLElement>;
  /** Ref to cumulative seconds already played in previous chunks (written by TTS player) */
  cumulativeTimeRef?: React.RefObject<number>;
  /** @deprecated Use cumulativeTimeRef instead */
  cumulativeTimeSec?: number;
  /** Ref to the current <audio> element for precise sync */
  audioRef?: React.RefObject<HTMLAudioElement>;
  estimatedDurationSec?: number;
  wordCount?: number;
  /** Chunk playback info from TTS player for precise word-level sync */
  chunkPlaybackInfo?: ChunkPlaybackInfo | null;
  /** Number of words prepended to TTS text that are NOT in the DOM (e.g. "Chapter 1: Title") */
  ttsWordOffset?: number;
}

interface UseAudioSyncReturn {
  sentences: SentenceTimestamp[];
  activeSentenceIndex: number;
  activeWordIndex: number;
  isSyncEnabled: boolean;
  toggleSync: () => void;
  isUserScrolledAway: boolean;
  followAudio: () => void;
  reset: () => void;
}

function buildTimestamps(sentences: string[], totalDurationSec: number): SentenceTimestamp[] {
  const totalChars = sentences.reduce((sum, s) => sum + s.length, 0);
  if (totalChars === 0 || totalDurationSec <= 0) return [];

  let cursor = 0;
  return sentences.map((text, index) => {
    const fraction = text.length / totalChars;
    const duration = fraction * totalDurationSec;
    const start = cursor;
    cursor += duration;
    return { index, text, startTime: start, endTime: cursor };
  });
}

export function useAudioSync({
  chapterContent,
  isPlaying,
  contentRef,
  cumulativeTimeRef: externalCumulativeRef,
  cumulativeTimeSec = 0,
  audioRef,
  estimatedDurationSec,
  wordCount: inputWordCount = 0,
  chunkPlaybackInfo,
  ttsWordOffset = 0,
}: UseAudioSyncOptions): UseAudioSyncReturn {
  // Total chapter duration estimate (for block-level fallback)
  const totalDuration = useMemo(
    () => estimatedDurationSec ?? (inputWordCount > 0 ? (inputWordCount / 150) * 60 : 60),
    [estimatedDurationSec, inputWordCount]
  );

  // Block-level timestamps (for block highlighting)
  const [sentences, setSentences] = useState<SentenceTimestamp[]>([]);
  const sentencesRef = useRef<SentenceTimestamp[]>([]);
  const domWordCountRef = useRef(0);
  const domScanRef = useRef<ReturnType<typeof setTimeout>>();

  // Scan DOM for block elements and count total words
  useEffect(() => {
    if (domScanRef.current) clearTimeout(domScanRef.current);

    const scan = () => {
      if (!contentRef.current) return;
      
      const blockEls = contentRef.current.querySelectorAll('[data-sentence-index]');
      if (blockEls.length === 0) {
        domScanRef.current = setTimeout(scan, 200);
        return;
      }
      const blockTexts: string[] = [];
      blockEls.forEach(el => {
        const text = (el as HTMLElement).innerText || '';
        blockTexts.push(text || ' ');
      });
      const ts = buildTimestamps(blockTexts, totalDuration);
      sentencesRef.current = ts;
      setSentences(ts);
      
      // Count total DOM words
      const wordEls = contentRef.current.querySelectorAll('[data-word-index]');
      domWordCountRef.current = wordEls.length;
      
      console.log(`[useAudioSync] Scanned ${blockEls.length} blocks, ${wordEls.length} DOM words`);
    };

    domScanRef.current = setTimeout(scan, 300);
    return () => { if (domScanRef.current) clearTimeout(domScanRef.current); };
  }, [chapterContent, totalDuration, contentRef]);

  const [activeSentenceIndex, setActiveSentenceIndex] = useState(-1);
  const [activeWordIndex, setActiveWordIndex] = useState(-1);
  const [isSyncEnabled, setIsSyncEnabled] = useState(true);
  const [isUserScrolledAway, setIsUserScrolledAway] = useState(false);

  // === REFS for real-time tick values ===
  const internalCumulativeRef = useRef(cumulativeTimeSec);
  const isPlayingRef = useRef(isPlaying);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const manualScrollTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const programmaticScrollRef = useRef(false);
  const activeSentenceRef = useRef(-1);
  const activeWordRef = useRef(-1);
  const chunkInfoRef = useRef<ChunkPlaybackInfo | null>(null);
  // Direct DOM refs for bypassing React render cycle (critical for mobile perf)
  const lastHighlightedWordEl = useRef<Element | null>(null);
  const lastHighlightedBlockEl = useRef<Element | null>(null);

  // Keep refs in sync
  useEffect(() => { internalCumulativeRef.current = cumulativeTimeSec; }, [cumulativeTimeSec]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { chunkInfoRef.current = chunkPlaybackInfo || null; }, [chunkPlaybackInfo]);

  // Tick: compute active word using chunk-aware interpolation
  // Uses direct DOM manipulation to bypass React render cycle for smooth mobile sync
  const tick = useCallback(() => {
    if (!isPlayingRef.current) return;

    const audio = audioRef?.current;
    const info = chunkInfoRef.current;
    const container = contentRef.current;
    const readingContent = container?.querySelector('.reading-content');
    const target = readingContent || container;

    // === WORD-LEVEL: Chunk-aware precise sync with proportional DOM mapping ===
    if (audio && info && info.chunkWordCounts.length > 0 && !isNaN(audio.currentTime) && !isNaN(audio.duration) && audio.duration > 0) {
      const fraction = Math.min(1, audio.currentTime / audio.duration);
      
      let ttsWordOffset_chunk = 0;
      for (let i = 0; i < info.chunkIndex && i < info.chunkWordCounts.length; i++) {
        ttsWordOffset_chunk += info.chunkWordCounts[i];
      }
      
      const wordsInChunk = info.chunkWordCounts[info.chunkIndex] || 1;
      const wordInChunk = Math.floor(fraction * wordsInChunk);
      const ttsGlobalWord = ttsWordOffset_chunk + wordInChunk;
      
      // If TTS is still speaking preamble words, don't highlight anything
      if (ttsGlobalWord < ttsWordOffset) {
        if (activeWordRef.current !== -1) {
          activeWordRef.current = -1;
          if (lastHighlightedWordEl.current) {
            lastHighlightedWordEl.current.classList.remove('audio-word-active');
            lastHighlightedWordEl.current = null;
          }
          setActiveWordIndex(-1);
        }
      } else {
        const adjustedTTSWord = ttsGlobalWord - ttsWordOffset;
        // Cache totalTTSWords — only recompute when chunkInfo changes (handled by ref)
        const totalTTSWords = info.chunkWordCounts.reduce((sum, c) => sum + c, 0);
        const adjustedTotalTTS = Math.max(1, totalTTSWords - ttsWordOffset);
        const domCount = domWordCountRef.current;
        const globalWordIdx = domCount > 0 && adjustedTotalTTS > 0
          ? Math.min(Math.floor((adjustedTTSWord / adjustedTotalTTS) * domCount), domCount - 1)
          : -1;
      
        if (globalWordIdx !== activeWordRef.current && globalWordIdx >= 0) {
          // DIRECT DOM: Remove old highlight, add new one (skip React state)
          if (lastHighlightedWordEl.current) {
            lastHighlightedWordEl.current.classList.remove('audio-word-active');
          }
          if (target) {
            const wordEl = target.querySelector(`[data-word-index="${globalWordIdx}"]`);
            if (wordEl) {
              wordEl.classList.add('audio-word-active');
              lastHighlightedWordEl.current = wordEl;
              
              // Scroll only every ~5 words to avoid constant reflow
              if (isSyncEnabled && !isUserScrolledAway && (globalWordIdx % 5 === 0 || globalWordIdx === 0)) {
                programmaticScrollRef.current = true;
                wordEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(() => { programmaticScrollRef.current = false; }, 600);
              }
            }
          }
          activeWordRef.current = globalWordIdx;
          // Debounce React state updates — only update every 3rd word
          if (globalWordIdx % 3 === 0) {
            setActiveWordIndex(globalWordIdx);
          }
        }
      }
    }

    // === BLOCK-LEVEL: Use cumulative time for block highlighting ===
    let t: number;
    const cumTime = externalCumulativeRef?.current ?? internalCumulativeRef.current;
    if (audio && !isNaN(audio.currentTime)) {
      t = cumTime + audio.currentTime;
    } else {
      t = cumTime;
    }

    const sents = sentencesRef.current;
    let idx = -1;
    for (let i = 0; i < sents.length; i++) {
      if (t >= sents[i].startTime && t < sents[i].endTime) {
        idx = i;
        break;
      }
    }
    if (idx === -1 && sents.length > 0 && t >= sents[sents.length - 1].startTime) {
      idx = sents.length - 1;
    }

    if (idx !== activeSentenceRef.current) {
      activeSentenceRef.current = idx;
      
      // DIRECT DOM: block-level highlight
      if (lastHighlightedBlockEl.current) {
        lastHighlightedBlockEl.current.classList.remove('audio-active');
      }
      if (target && idx >= 0) {
        const el = target.querySelector(`[data-sentence-index="${idx}"]`);
        if (el) {
          el.classList.add('audio-active');
          lastHighlightedBlockEl.current = el;
        }
      }
      setActiveSentenceIndex(idx);
    }
  }, [audioRef, isSyncEnabled, isUserScrolledAway, contentRef]);

  // Start / stop tick loop — use setInterval (50ms) instead of RAF for reliable mobile timing
  useEffect(() => {
    if (isPlaying && sentences.length > 0) {
      // Add/remove audio-playing class on container
      const container = contentRef.current;
      const readingContent = container?.querySelector('.reading-content');
      const target = readingContent || container;
      target?.classList.add('audio-playing');
      
      intervalRef.current = setInterval(tick, 30);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      
      // Clean up highlights when stopped
      if (lastHighlightedWordEl.current) {
        lastHighlightedWordEl.current.classList.remove('audio-word-active');
        lastHighlightedWordEl.current = null;
      }
      if (lastHighlightedBlockEl.current) {
        lastHighlightedBlockEl.current.classList.remove('audio-active');
        lastHighlightedBlockEl.current = null;
      }
      const container = contentRef.current;
      const readingContent = container?.querySelector('.reading-content');
      const target = readingContent || container;
      target?.classList.remove('audio-playing');
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, tick, sentences.length, contentRef]);

  // Detect manual scroll
  useEffect(() => {
    if (!isSyncEnabled || !isPlaying) return;

    const scrollTarget = contentRef.current || window;

    const handleScroll = () => {
      if (programmaticScrollRef.current) return;

      setIsUserScrolledAway(true);

      if (manualScrollTimeoutRef.current) clearTimeout(manualScrollTimeoutRef.current);
      manualScrollTimeoutRef.current = setTimeout(() => {
        setIsUserScrolledAway(false);
      }, 8000);
    };

    scrollTarget.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      scrollTarget.removeEventListener('scroll', handleScroll);
      if (manualScrollTimeoutRef.current) clearTimeout(manualScrollTimeoutRef.current);
    };
  }, [isSyncEnabled, isPlaying, contentRef]);

  const toggleSync = useCallback(() => {
    setIsSyncEnabled(prev => !prev);
    setIsUserScrolledAway(false);
  }, []);

  const followAudio = useCallback(() => {
    setIsUserScrolledAway(false);
    const el = contentRef.current?.querySelector(`[data-word-index="${activeWordRef.current}"]`) ||
               contentRef.current?.querySelector(`[data-sentence-index="${activeSentenceRef.current}"]`);
    if (el) {
      programmaticScrollRef.current = true;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => { programmaticScrollRef.current = false; }, 600);
    }
  }, [contentRef]);

  const reset = useCallback(() => {
    activeSentenceRef.current = -1;
    activeWordRef.current = -1;
    setActiveSentenceIndex(-1);
    setActiveWordIndex(-1);
    setIsUserScrolledAway(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (lastHighlightedWordEl.current) {
      lastHighlightedWordEl.current.classList.remove('audio-word-active');
      lastHighlightedWordEl.current = null;
    }
    if (lastHighlightedBlockEl.current) {
      lastHighlightedBlockEl.current.classList.remove('audio-active');
      lastHighlightedBlockEl.current = null;
    }
  }, []);

  // Reset when chapter content changes
  useEffect(() => {
    reset();
  }, [chapterContent, reset]);

  return {
    sentences,
    activeSentenceIndex,
    activeWordIndex,
    isSyncEnabled,
    toggleSync,
    isUserScrolledAway,
    followAudio,
    reset,
  };
}
