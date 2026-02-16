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
 * Supports two modes:
 * - Real audioRef: reads audio.currentTime + cumulative offset
 * - Simulated: rAF-based timer (fallback)
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { stripMarkdown } from '@/lib/sentenceUtils';

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
  // Total chapter duration estimate — used for distributing timestamps across ALL sentences.
  // IMPORTANT: Do NOT use per-chunk audio.duration here. Each TTS chunk is ~20-30s,
  // but we need the total chapter duration to map sentence positions correctly.
  // The position tracking (cumulativeTimeSec + audio.currentTime) handles real-time sync.
  const totalDuration = useMemo(
    () => estimatedDurationSec ?? (wordCount > 0 ? (wordCount / 150) * 60 : 60),
    [estimatedDurationSec, wordCount]
  );

  const sentences = useMemo<SentenceTimestamp[]>(() => {
    if (!chapterContent) return [];
    const plain = stripMarkdown(chapterContent);
    const paragraphs = plain.split(/\n\n+/).map(s => s.trim()).filter(s => s.length > 0);
    return buildTimestamps(paragraphs, totalDuration);
  }, [chapterContent, totalDuration]);

  const [activeSentenceIndex, setActiveSentenceIndex] = useState(-1);
  const [isSyncEnabled, setIsSyncEnabled] = useState(true);
  const [isUserScrolledAway, setIsUserScrolledAway] = useState(false);

  const playbackTimeRef = useRef(0);
  const lastTickRef = useRef(0);
  const rafRef = useRef<number>();
  const manualScrollTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const programmaticScrollRef = useRef(false);

  // Tick: compute current global time and find active sentence
  const tick = useCallback((now: number) => {
    if (!isPlaying) return;

    let t: number;
    if (audioRef?.current && !isNaN(audioRef.current.currentTime)) {
      // Real audio: cumulative offset + current chunk position
      t = cumulativeTimeSec + audioRef.current.currentTime;
    } else {
      // Fallback: simulate time via rAF delta
      if (lastTickRef.current > 0) {
        const dt = (now - lastTickRef.current) / 1000;
        playbackTimeRef.current += dt;
      }
      lastTickRef.current = now;
      t = playbackTimeRef.current;
    }

    // Binary-ish search for active sentence
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
  }, [isPlaying, sentences, audioRef, cumulativeTimeSec]);

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
