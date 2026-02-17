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
  const rafRef = useRef<number>();
  const manualScrollTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const programmaticScrollRef = useRef(false);
  const activeSentenceRef = useRef(-1);
  const activeWordRef = useRef(-1);
  const chunkInfoRef = useRef<ChunkPlaybackInfo | null>(null);

  // Keep refs in sync
  useEffect(() => { internalCumulativeRef.current = cumulativeTimeSec; }, [cumulativeTimeSec]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { chunkInfoRef.current = chunkPlaybackInfo || null; }, [chunkPlaybackInfo]);

  // Tick: compute active word using chunk-aware interpolation
  const tick = useCallback((now: number) => {
    if (!isPlayingRef.current) return;

    const audio = audioRef?.current;
    const info = chunkInfoRef.current;

    // === WORD-LEVEL: Chunk-aware precise sync ===
    if (audio && info && info.chunkWordCounts.length > 0 && !isNaN(audio.currentTime) && !isNaN(audio.duration) && audio.duration > 0) {
      const fraction = Math.min(1, audio.currentTime / audio.duration);
      
      // Calculate word offset for current chunk
      let wordOffset = 0;
      for (let i = 0; i < info.chunkIndex && i < info.chunkWordCounts.length; i++) {
        wordOffset += info.chunkWordCounts[i];
      }
      
      const wordsInChunk = info.chunkWordCounts[info.chunkIndex] || 1;
      const wordInChunk = Math.floor(fraction * wordsInChunk);
      const globalWordIdx = Math.min(wordOffset + wordInChunk, domWordCountRef.current - 1);
      
      if (globalWordIdx !== activeWordRef.current && globalWordIdx >= 0) {
        activeWordRef.current = globalWordIdx;
        setActiveWordIndex(globalWordIdx);
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
      setActiveSentenceIndex(idx);
    }

    rafRef.current = requestAnimationFrame(tick);
  }, [audioRef]);

  // Start / stop tick loop
  useEffect(() => {
    if (isPlaying && sentences.length > 0) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, tick, sentences.length]);

  // Scroll active word into center
  useEffect(() => {
    if (!isSyncEnabled || isUserScrolledAway) return;
    if (activeWordIndex < 0 && activeSentenceIndex < 0) return;

    const wordEl = activeWordIndex >= 0 
      ? contentRef.current?.querySelector(`[data-word-index="${activeWordIndex}"]`)
      : null;
    const el = wordEl || contentRef.current?.querySelector(`[data-sentence-index="${activeSentenceIndex}"]`);
    if (!el) return;

    programmaticScrollRef.current = true;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });

    setTimeout(() => {
      programmaticScrollRef.current = false;
    }, 600);
  }, [activeWordIndex, activeSentenceIndex, isSyncEnabled, isUserScrolledAway, contentRef]);

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
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
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
