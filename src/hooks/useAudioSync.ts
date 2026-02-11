/**
 * Sentence-Level Audio Synchronization Hook
 *
 * Parses chapter content into sentences, tracks audio.currentTime,
 * determines the active sentence, highlights it, and scrolls it
 * into the center of the viewport.
 *
 * Features:
 * - Sentence parsing with timestamp estimation
 * - 100ms throttled currentTime tracking
 * - Active sentence index derivation
 * - Smooth center-scroll with manual-scroll detection
 * - "Sync scrolling with audio" toggle
 * - "Follow Audio" button when user scrolls away
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

// --- Types ---

export interface SentenceTimestamp {
  /** Sentence index */
  index: number;
  /** Plain text of the sentence */
  text: string;
  /** Estimated start time in seconds */
  startTime: number;
  /** Estimated end time in seconds */
  endTime: number;
}

interface UseAudioSyncOptions {
  /** Raw chapter markdown / text */
  chapterContent: string | null;
  /** Whether TTS is currently playing */
  isPlaying: boolean;
  /** Ref to the scrollable content container */
  contentRef: React.RefObject<HTMLElement>;
  /** Estimated total audio duration in seconds */
  estimatedDurationSec?: number;
  /** Word count of the chapter (used for duration estimation) */
  wordCount?: number;
}

interface UseAudioSyncReturn {
  /** Array of parsed sentences with estimated timestamps */
  sentences: SentenceTimestamp[];
  /** Index of the currently active sentence (-1 = none) */
  activeSentenceIndex: number;
  /** Whether sync-scrolling is enabled */
  isSyncEnabled: boolean;
  /** Toggle sync-scrolling on/off */
  toggleSync: () => void;
  /** Whether the user has manually scrolled away from the active sentence */
  isUserScrolledAway: boolean;
  /** Jump back to the active sentence */
  followAudio: () => void;
  /** Reset state (e.g. on chapter change) */
  reset: () => void;
}

// --- Helpers ---

/** Strip markdown to plain text for sentence parsing */
function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, '')        // code blocks
    .replace(/`[^`]+`/g, '')               // inline code
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')  // images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links → text
    .replace(/#{1,6}\s*/g, '')             // headings
    .replace(/[*_]{1,3}/g, '')             // bold/italic
    .replace(/^\s*[-*>]\s+/gm, '')         // list / quote markers
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/** Split plain text into sentences */
function splitSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by whitespace
  const raw = text.split(/(?<=[.!?])\s+/);
  return raw.map(s => s.trim()).filter(s => s.length > 0);
}

/** Build timestamp array assuming uniform reading speed */
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
  estimatedDurationSec,
  wordCount = 0,
}: UseAudioSyncOptions): UseAudioSyncReturn {
  // Estimate duration: ~150 wpm for TTS → seconds
  const duration = estimatedDurationSec ?? (wordCount > 0 ? (wordCount / 150) * 60 : 60);

  // Parse sentences once per chapter content change
  const sentences = useMemo<SentenceTimestamp[]>(() => {
    if (!chapterContent) return [];
    const plain = stripMarkdown(chapterContent);
    const sents = splitSentences(plain);
    return buildTimestamps(sents, duration);
  }, [chapterContent, duration]);

  const [activeSentenceIndex, setActiveSentenceIndex] = useState(-1);
  const [isSyncEnabled, setIsSyncEnabled] = useState(true);
  const [isUserScrolledAway, setIsUserScrolledAway] = useState(false);

  // Track simulated playback time (incremented via rAF while playing)
  const playbackTimeRef = useRef(0);
  const lastTickRef = useRef(0);
  const rafRef = useRef<number>();
  const manualScrollTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const programmaticScrollRef = useRef(false);

  // --- Throttled tick: update active sentence every ~100ms ---
  const tick = useCallback((now: number) => {
    if (!isPlaying) return;

    // Advance simulated playback time
    if (lastTickRef.current > 0) {
      const dt = (now - lastTickRef.current) / 1000;
      playbackTimeRef.current += dt;
    }
    lastTickRef.current = now;

    const t = playbackTimeRef.current;
    // Binary-ish search for active sentence
    let idx = -1;
    for (let i = 0; i < sentences.length; i++) {
      if (t >= sentences[i].startTime && t < sentences[i].endTime) {
        idx = i;
        break;
      }
    }
    // If past last sentence, clamp to last
    if (idx === -1 && sentences.length > 0 && t >= sentences[sentences.length - 1].startTime) {
      idx = sentences.length - 1;
    }

    setActiveSentenceIndex(prev => {
      if (prev === idx) return prev;
      return idx;
    });

    rafRef.current = requestAnimationFrame(tick);
  }, [isPlaying, sentences]);

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

    // Reset flag after scroll completes (~500ms)
    setTimeout(() => {
      programmaticScrollRef.current = false;
    }, 600);
  }, [activeSentenceIndex, isSyncEnabled, isUserScrolledAway, contentRef]);

  // --- Detect manual scroll to show "Follow Audio" ---
  useEffect(() => {
    if (!isSyncEnabled || !isPlaying) return;

    const handleScroll = () => {
      if (programmaticScrollRef.current) return;

      setIsUserScrolledAway(true);

      // Auto-dismiss after 8s of no scroll
      if (manualScrollTimeoutRef.current) clearTimeout(manualScrollTimeoutRef.current);
      manualScrollTimeoutRef.current = setTimeout(() => {
        setIsUserScrolledAway(false);
      }, 8000);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (manualScrollTimeoutRef.current) clearTimeout(manualScrollTimeoutRef.current);
    };
  }, [isSyncEnabled, isPlaying]);

  // --- Public API ---

  const toggleSync = useCallback(() => {
    setIsSyncEnabled(prev => !prev);
    setIsUserScrolledAway(false);
  }, []);

  const followAudio = useCallback(() => {
    setIsUserScrolledAway(false);
    // Immediately scroll to active sentence
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
