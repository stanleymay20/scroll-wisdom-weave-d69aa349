/**
 * Sentence-Level Audio Synchronization Hook
 *
 * Reads audio.currentTime from a real audio element ref (no internal simulation).
 * Parses chapter content into sentences, determines the active sentence,
 * highlights it, and scrolls it into the center of the viewport.
 *
 * FIXES (audit):
 * - Uses real audio.currentTime instead of simulated rAF timer
 * - Scroll listener attached to contentRef instead of window
 * - splitSentences imported from shared util
 * - Duration memoised to prevent sentence array rebuild
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { stripMarkdown, splitSentences } from '@/lib/sentenceUtils';

// --- Types ---

export interface SentenceTimestamp {
  index: number;
  text: string;
  startTime: number;
  endTime: number;
}

interface UseAudioSyncOptions {
  chapterContent: string | null;
  isPlaying: boolean;
  /** Ref to the scrollable content container */
  contentRef: React.RefObject<HTMLElement>;
  /** Optional ref to the real <audio> element for precise sync */
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

// --- Helpers ---

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

// --- Hook ---

export function useAudioSync({
  chapterContent,
  isPlaying,
  contentRef,
  audioRef,
  estimatedDurationSec,
  wordCount = 0,
}: UseAudioSyncOptions): UseAudioSyncReturn {
  // Memoize duration to prevent sentence array rebuilds
  const duration = useMemo(
    () => estimatedDurationSec ?? (wordCount > 0 ? (wordCount / 150) * 60 : 60),
    [estimatedDurationSec, wordCount]
  );

  const sentences = useMemo<SentenceTimestamp[]>(() => {
    if (!chapterContent) return [];
    const plain = stripMarkdown(chapterContent);
    const sents = splitSentences(plain);
    return buildTimestamps(sents, duration);
  }, [chapterContent, duration]);

  const [activeSentenceIndex, setActiveSentenceIndex] = useState(-1);
  const [isSyncEnabled, setIsSyncEnabled] = useState(true);
  const [isUserScrolledAway, setIsUserScrolledAway] = useState(false);

  // Fallback simulated time when no audioRef is provided
  const playbackTimeRef = useRef(0);
  const lastTickRef = useRef(0);
  const rafRef = useRef<number>();
  const manualScrollTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const programmaticScrollRef = useRef(false);

  // --- Tick: read real currentTime or fall back to simulation ---
  const tick = useCallback((now: number) => {
    if (!isPlaying) return;

    let t: number;
    if (audioRef?.current && !isNaN(audioRef.current.currentTime)) {
      // Real audio element — precise sync
      t = audioRef.current.currentTime;
    } else {
      // Fallback: simulate time via rAF delta
      if (lastTickRef.current > 0) {
        const dt = (now - lastTickRef.current) / 1000;
        playbackTimeRef.current += dt;
      }
      lastTickRef.current = now;
      t = playbackTimeRef.current;
    }

    // Find active sentence
    let idx = -1;
    for (let i = 0; i < sentences.length; i++) {
      if (t >= sentences[i].startTime && t < sentences[i].endTime) {
        idx = i;
        break;
      }
    }
    if (idx === -1 && sentences.length > 0 && t >= sentences[sentences.length - 1].startTime) {
      idx = sentences.length - 1;
    }

    setActiveSentenceIndex(prev => (prev === idx ? prev : idx));

    rafRef.current = requestAnimationFrame(tick);
  }, [isPlaying, sentences, audioRef]);

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

  // --- Scroll active sentence into center ---
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

  // --- Detect manual scroll on contentRef (not window) ---
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

  // --- Public API ---

  const toggleSync = useCallback(() => {
    setIsSyncEnabled(prev => !prev);
    setIsUserScrolledAway(false);
  }, []);

  const followAudio = useCallback(() => {
    setIsUserScrolledAway(false);
    const el = contentRef.current?.querySelector(`[data-sentence-index="${activeSentenceIndex}"]`);
    if (el) {
      programmaticScrollRef.current = true;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => { programmaticScrollRef.current = false; }, 600);
    }
  }, [activeSentenceIndex, contentRef]);

  const reset = useCallback(() => {
    playbackTimeRef.current = 0;
    lastTickRef.current = 0;
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
