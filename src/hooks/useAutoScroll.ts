/**
 * Auto-Scroll Hook for Audio Sync
 *
 * Synchronizes page scroll with audio playback:
 * - Calculates scroll speed based on content length
 * - Smooth scrolling that follows audio progress
 * - Pause/resume with audio state
 *
 * FIXES (audit):
 * - Raised manual-scroll threshold from 10px to 30px
 * - Added startAutoScroll/pauseAutoScroll to useEffect deps
 * - Proper cleanup of animation frames
 */

import { useState, useEffect, useRef, useCallback } from 'react';

interface UseAutoScrollOptions {
  isPlaying: boolean;
  contentRef: React.RefObject<HTMLElement>;
  estimatedDurationMs?: number;
  enabled?: boolean;
}

export function useAutoScroll({
  isPlaying,
  contentRef,
  estimatedDurationMs = 60000,
  enabled = true,
}: UseAutoScrollOptions) {
  const [isAutoScrolling, setIsAutoScrolling] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);

  const animationRef = useRef<number>();
  const startTimeRef = useRef<number>(0);
  const pausedTimeRef = useRef<number>(0);
  const isPlayingRef = useRef(isPlaying);
  const enabledRef = useRef(enabled);

  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);

  const getScrollParams = useCallback(() => {
    if (!contentRef.current) return null;
    const scrollHeight = contentRef.current.scrollHeight - contentRef.current.clientHeight;
    return {
      scrollHeight,
      duration: estimatedDurationMs,
      pixelsPerMs: scrollHeight / estimatedDurationMs,
    };
  }, [estimatedDurationMs, contentRef]);

  const startAutoScroll = useCallback(() => {
    if (!enabledRef.current || !contentRef.current) return;
    const params = getScrollParams();
    if (!params || params.scrollHeight <= 0) return;

    setIsAutoScrolling(true);

    const now = performance.now();
    if (pausedTimeRef.current > 0) {
      startTimeRef.current = now - pausedTimeRef.current;
    } else {
      startTimeRef.current = now;
    }

    const animate = (currentTime: number) => {
      if (!contentRef.current || !isPlayingRef.current) return;

      const elapsed = currentTime - startTimeRef.current;
      const progress = Math.min(elapsed / params.duration, 1);
      const targetScroll = params.scrollHeight * progress;

      contentRef.current.scrollTop = targetScroll;
      setScrollProgress(progress * 100);

      if (progress < 1 && isPlayingRef.current) {
        animationRef.current = requestAnimationFrame(animate);
      } else if (progress >= 1) {
        setIsAutoScrolling(false);
        pausedTimeRef.current = 0;
      }
    };

    animationRef.current = requestAnimationFrame(animate);
  }, [contentRef, getScrollParams]);

  const pauseAutoScroll = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = undefined;
    }
    if (startTimeRef.current > 0) {
      pausedTimeRef.current = performance.now() - startTimeRef.current;
    }
    setIsAutoScrolling(false);
  }, []);

  const resetScroll = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = undefined;
    }
    pausedTimeRef.current = 0;
    startTimeRef.current = 0;
    setScrollProgress(0);
    setIsAutoScrolling(false);
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [contentRef]);

  const toggleAutoScroll = useCallback(() => {
    if (isAutoScrolling) {
      pauseAutoScroll();
    } else {
      startAutoScroll();
    }
  }, [isAutoScrolling, pauseAutoScroll, startAutoScroll]);

  // Sync with audio playing state — deps now include the callbacks
  useEffect(() => {
    if (!enabled) return;

    if (isPlaying) {
      startAutoScroll();
    } else {
      pauseAutoScroll();
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, enabled, startAutoScroll, pauseAutoScroll]);

  // Handle manual scroll interruption — threshold raised to 30px
  useEffect(() => {
    const element = contentRef.current;
    if (!element || !isAutoScrolling) return;

    let lastScrollTop = element.scrollTop;
    let manualScrollTimeout: ReturnType<typeof setTimeout>;
    let isUserScrolling = false;

    const handleScroll = () => {
      const currentScrollTop = element.scrollTop;
      const scrollDiff = Math.abs(currentScrollTop - lastScrollTop);

      // 30px threshold avoids false positives from touch jitter
      if (scrollDiff > 30 && !isUserScrolling) {
        isUserScrolling = true;
        pauseAutoScroll();

        clearTimeout(manualScrollTimeout);
        manualScrollTimeout = setTimeout(() => {
          isUserScrolling = false;
          if (isPlayingRef.current && enabledRef.current) {
            pausedTimeRef.current = 0;
            const params = getScrollParams();
            if (params && params.scrollHeight > 0) {
              const currentProgress = element.scrollTop / params.scrollHeight;
              pausedTimeRef.current = currentProgress * params.duration;
            }
            startAutoScroll();
          }
        }, 3000);
      }

      lastScrollTop = currentScrollTop;
    };

    element.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      element.removeEventListener('scroll', handleScroll);
      clearTimeout(manualScrollTimeout);
    };
  }, [isAutoScrolling, pauseAutoScroll, startAutoScroll, getScrollParams, contentRef]);

  return {
    isAutoScrolling,
    scrollProgress,
    startAutoScroll,
    pauseAutoScroll,
    resetScroll,
    toggleAutoScroll,
  };
}
