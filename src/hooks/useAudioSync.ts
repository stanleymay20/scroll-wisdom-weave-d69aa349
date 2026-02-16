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

interface UseAudioSyncOptions {
  chapterContent: string | null;
  isPlaying: boolean;
  contentRef: React.RefObject<HTMLElement>;
  /** Cumulative seconds already played in previous chunks */
  cumulativeTimeSec?: number;
  /** Ref to the current <audio> element for precise sync */
  audioRef?: React.RefObject<HTMLAudioElement>;
  estimatedDurationSec?: number;
  wordCount?: number;
}

interface UseAudioSyncReturn {
  sentences: SentenceTimestamp[];
  activeSentenceIndex: number;
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
  cumulativeTimeSec = 0,
  audioRef,
  estimatedDurationSec,
  wordCount = 0,
}: UseAudioSyncOptions): UseAudioSyncReturn {
  // Total chapter duration estimate
  const totalDuration = useMemo(
    () => estimatedDurationSec ?? (wordCount > 0 ? (wordCount / 150) * 60 : 60),
    [estimatedDurationSec, wordCount]
  );

  // Build timestamps from DOM elements with data-sentence-index.
  const [sentences, setSentences] = useState<SentenceTimestamp[]>([]);
  const sentencesRef = useRef<SentenceTimestamp[]>([]);
  const domScanRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (domScanRef.current) clearTimeout(domScanRef.current);

    const scan = () => {
      if (!contentRef.current) return;
      const els = contentRef.current.querySelectorAll('[data-sentence-index]');
      if (els.length === 0) {
        domScanRef.current = setTimeout(scan, 200);
        return;
      }
      const texts: string[] = [];
      els.forEach(el => {
        const text = (el as HTMLElement).innerText || '';
        texts.push(text || ' ');
      });
      const ts = buildTimestamps(texts, totalDuration);
      sentencesRef.current = ts;
      setSentences(ts);
      console.log(`[useAudioSync] Built timestamps for ${texts.length} sentences, totalDuration=${totalDuration.toFixed(1)}s`);
    };

    domScanRef.current = setTimeout(scan, 300);
    return () => { if (domScanRef.current) clearTimeout(domScanRef.current); };
  }, [chapterContent, totalDuration, contentRef]);

  const [activeSentenceIndex, setActiveSentenceIndex] = useState(-1);
  const [isSyncEnabled, setIsSyncEnabled] = useState(true);
  const [isUserScrolledAway, setIsUserScrolledAway] = useState(false);

  // === REFS for real-time tick values (avoids stale closures) ===
  const cumulativeTimeSecRef = useRef(cumulativeTimeSec);
  const isPlayingRef = useRef(isPlaying);
  const playbackTimeRef = useRef(0);
  const lastTickRef = useRef(0);
  const rafRef = useRef<number>();
  const manualScrollTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const programmaticScrollRef = useRef(false);
  const activeSentenceRef = useRef(-1);

  // Keep refs in sync with props/state
  useEffect(() => { cumulativeTimeSecRef.current = cumulativeTimeSec; }, [cumulativeTimeSec]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  // Tick: compute current global time and find active sentence.
  // Uses REFS only — no closure dependency on changing props.
  const tick = useCallback((now: number) => {
    if (!isPlayingRef.current) return;

    let t: number;
    if (audioRef?.current && !isNaN(audioRef.current.currentTime)) {
      t = cumulativeTimeSecRef.current + audioRef.current.currentTime;
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

  // Scroll active sentence into center
  useEffect(() => {
    if (!isSyncEnabled || activeSentenceIndex < 0 || isUserScrolledAway) return;

    const el = contentRef.current?.querySelector(`[data-sentence-index="${activeSentenceIndex}"]`);
    if (!el) return;

    programmaticScrollRef.current = true;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });

    setTimeout(() => {
      programmaticScrollRef.current = false;
    }, 600);
  }, [activeSentenceIndex, isSyncEnabled, isUserScrolledAway, contentRef]);

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
    setActiveSentenceIndex(-1);
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
    isSyncEnabled,
    toggleSync,
    isUserScrolledAway,
    followAudio,
    reset,
  };
}
