/**
 * Sentence-Level Audio Synchronization Hook
 *
 * Tracks cumulative playback time across TTS chunks to determine
 * the active sentence, highlight it, and scroll it into view.
 *
 * Architecture (YouVersion-style):
 * 1. Parse chapter → sentences with proportional timestamps
 * 2. Track cumulative time: chunkStartTime + audio.currentTime
 * 3. Match time → active sentence
 * 4. Highlight + smooth scroll to center
 *
 * FIX: Uses refs for all real-time values in the rAF tick loop
 * to avoid stale closures when React state updates lag behind
 * (e.g., between chunk transitions where cumulativeTimeSec updates).
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

export interface SentenceTimestamp {
  index: number;
  text: string;
  startTime: number;
  endTime: number;
}

export interface WordTimestamp {
  index: number;
  text: string;
  startTime: number;
  endTime: number;
  blockIndex: number; // which data-sentence-index block this word belongs to
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
}: UseAudioSyncOptions): UseAudioSyncReturn {
  // Total chapter duration estimate
  const totalDuration = useMemo(
    () => estimatedDurationSec ?? (inputWordCount > 0 ? (inputWordCount / 150) * 60 : 60),
    [estimatedDurationSec, inputWordCount]
  );

  // Build timestamps from DOM elements with data-sentence-index (blocks) AND data-word-index (words).
  const [sentences, setSentences] = useState<SentenceTimestamp[]>([]);
  const sentencesRef = useRef<SentenceTimestamp[]>([]);
  const wordsRef = useRef<WordTimestamp[]>([]);
  const domScanRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (domScanRef.current) clearTimeout(domScanRef.current);

    const scan = () => {
      if (!contentRef.current) return;
      
      // Scan block-level elements
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
      
      // Scan word-level elements
      const wordEls = contentRef.current.querySelectorAll('[data-word-index]');
      const wordTexts: string[] = [];
      const wordBlockMap: number[] = [];
      wordEls.forEach(el => {
        const text = (el as HTMLElement).textContent || '';
        wordTexts.push(text);
        // Find which block this word belongs to
        const blockParent = (el as HTMLElement).closest('[data-sentence-index]');
        const blockIdx = blockParent ? parseInt(blockParent.getAttribute('data-sentence-index') || '-1') : -1;
        wordBlockMap.push(blockIdx);
      });
      
      // Build word timestamps proportional to character length
      const totalChars = wordTexts.reduce((sum, w) => sum + w.length, 0);
      if (totalChars > 0 && totalDuration > 0) {
        let cursor = 0;
        const wts: WordTimestamp[] = wordTexts.map((text, index) => {
          const fraction = text.length / totalChars;
          const duration = fraction * totalDuration;
          const start = cursor;
          cursor += duration;
          return { index, text, startTime: start, endTime: cursor, blockIndex: wordBlockMap[index] };
        });
        wordsRef.current = wts;
      }
      
      console.log(`[useAudioSync] Built timestamps for ${blockTexts.length} blocks, ${wordTexts.length} words, totalDuration=${totalDuration.toFixed(1)}s`);
    };

    domScanRef.current = setTimeout(scan, 300);
    return () => { if (domScanRef.current) clearTimeout(domScanRef.current); };
  }, [chapterContent, totalDuration, contentRef]);

  const [activeSentenceIndex, setActiveSentenceIndex] = useState(-1);
  const [activeWordIndex, setActiveWordIndex] = useState(-1);
  const [isSyncEnabled, setIsSyncEnabled] = useState(true);
  const [isUserScrolledAway, setIsUserScrolledAway] = useState(false);

  // === REFS for real-time tick values (avoids stale closures) ===
  const internalCumulativeRef = useRef(cumulativeTimeSec);
  const isPlayingRef = useRef(isPlaying);
  const playbackTimeRef = useRef(0);
  const lastTickRef = useRef(0);
  const rafRef = useRef<number>();
  const manualScrollTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const programmaticScrollRef = useRef(false);
  const activeSentenceRef = useRef(-1);
  const activeWordRef = useRef(-1);

  // Keep refs in sync with props/state
  useEffect(() => { internalCumulativeRef.current = cumulativeTimeSec; }, [cumulativeTimeSec]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  // Tick: compute current global time and find active sentence.
  // Uses REFS only — no closure dependency on changing props.
  const tick = useCallback((now: number) => {
    if (!isPlayingRef.current) return;

    let t: number;
    // Prefer external ref (direct from TTS player, no React state lag)
    const cumTime = externalCumulativeRef?.current ?? internalCumulativeRef.current;
    if (audioRef?.current && !isNaN(audioRef.current.currentTime)) {
      t = cumTime + audioRef.current.currentTime;
    } else {
      if (lastTickRef.current > 0) {
        const dt = (now - lastTickRef.current) / 1000;
        playbackTimeRef.current += dt;
      }
      lastTickRef.current = now;
      t = playbackTimeRef.current;
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

    // Word-level tracking
    const words = wordsRef.current;
    let wIdx = -1;
    for (let i = 0; i < words.length; i++) {
      if (t >= words[i].startTime && t < words[i].endTime) {
        wIdx = i;
        break;
      }
    }
    if (wIdx === -1 && words.length > 0 && t >= words[words.length - 1].startTime) {
      wIdx = words.length - 1;
    }
    if (wIdx !== activeWordRef.current) {
      activeWordRef.current = wIdx;
      setActiveWordIndex(wIdx);
    }

    rafRef.current = requestAnimationFrame(tick);
  }, [audioRef]); // Only depends on audioRef identity (stable ref)

  // Start / stop tick loop
  useEffect(() => {
    if (isPlaying && sentences.length > 0) {
      lastTickRef.current = 0;
      rafRef.current = requestAnimationFrame(tick);
    } else {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTickRef.current = 0;
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, tick, sentences.length]);

  // Scroll active word (or block) into center
  useEffect(() => {
    if (!isSyncEnabled || isUserScrolledAway) return;
    if (activeWordIndex < 0 && activeSentenceIndex < 0) return;

    // Prefer scrolling to the active word for precision
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
    const el = contentRef.current?.querySelector(`[data-sentence-index="${activeSentenceRef.current}"]`);
    if (el) {
      programmaticScrollRef.current = true;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => { programmaticScrollRef.current = false; }, 600);
    }
  }, [contentRef]);

  const reset = useCallback(() => {
    playbackTimeRef.current = 0;
    lastTickRef.current = 0;
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
