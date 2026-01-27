/**
 * Auto-Scroll Hook for Audio Sync
 * 
 * Synchronizes page scroll with audio playback:
 * - Calculates scroll speed based on content length
 * - Smooth scrolling that follows audio progress
 * - Pause/resume with audio state
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
  const startScrollRef = useRef<number>(0);
  const pausedAtRef = useRef<number>(0);

  // Calculate scroll parameters
  const getScrollParams = useCallback(() => {
    if (!contentRef.current) return null;

    const element = contentRef.current;
    const scrollHeight = element.scrollHeight - element.clientHeight;
    
    return {
      scrollHeight,
      duration: estimatedDurationMs,
      pixelsPerMs: scrollHeight / estimatedDurationMs,
    };
  }, [contentRef, estimatedDurationMs]);

  // Start auto-scrolling
  const startAutoScroll = useCallback(() => {
    if (!enabled || !contentRef.current) return;

    const params = getScrollParams();
    if (!params || params.scrollHeight <= 0) return;

    setIsAutoScrolling(true);
    startTimeRef.current = performance.now() - pausedAtRef.current;
    startScrollRef.current = contentRef.current.scrollTop;

    const animate = (currentTime: number) => {
      if (!contentRef.current) return;

      const elapsed = currentTime - startTimeRef.current;
      const progress = Math.min(elapsed / params.duration, 1);
      
      // Eased scrolling for smoother motion
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      const targetScroll = startScrollRef.current + (params.scrollHeight - startScrollRef.current) * easeProgress;
      
      contentRef.current.scrollTop = targetScroll;
      setScrollProgress(progress * 100);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        setIsAutoScrolling(false);
      }
    };

    animationRef.current = requestAnimationFrame(animate);
  }, [enabled, contentRef, getScrollParams]);

  // Pause auto-scrolling
  const pauseAutoScroll = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = undefined;
    }
    pausedAtRef.current = performance.now() - startTimeRef.current;
    setIsAutoScrolling(false);
  }, []);

  // Resume auto-scrolling
  const resumeAutoScroll = useCallback(() => {
    if (enabled && pausedAtRef.current > 0) {
      startAutoScroll();
    }
  }, [enabled, startAutoScroll]);

  // Reset scroll position
  const resetScroll = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    pausedAtRef.current = 0;
    setScrollProgress(0);
    setIsAutoScrolling(false);
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [contentRef]);

  // Toggle auto-scroll
  const toggleAutoScroll = useCallback(() => {
    if (isAutoScrolling) {
      pauseAutoScroll();
    } else {
      startAutoScroll();
    }
  }, [isAutoScrolling, pauseAutoScroll, startAutoScroll]);

  // Sync with audio playing state
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

  // Handle manual scroll interruption
  useEffect(() => {
    if (!contentRef.current || !isAutoScrolling) return;

    let lastScrollTop = contentRef.current.scrollTop;
    let manualScrollTimeout: ReturnType<typeof setTimeout>;

    const handleScroll = () => {
      if (!contentRef.current) return;
      
      const currentScrollTop = contentRef.current.scrollTop;
      const scrollDiff = Math.abs(currentScrollTop - lastScrollTop);
      
      // If user scrolls significantly, pause auto-scroll temporarily
      if (scrollDiff > 50) {
        pauseAutoScroll();
        
        // Resume after 3 seconds of no manual scroll
        clearTimeout(manualScrollTimeout);
        manualScrollTimeout = setTimeout(() => {
          if (isPlaying) {
            // Adjust start position to current position
            pausedAtRef.current = 0;
            startScrollRef.current = contentRef.current?.scrollTop || 0;
            startAutoScroll();
          }
        }, 3000);
      }
      
      lastScrollTop = currentScrollTop;
    };

    contentRef.current.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      contentRef.current?.removeEventListener('scroll', handleScroll);
      clearTimeout(manualScrollTimeout);
    };
  }, [contentRef, isAutoScrolling, isPlaying, pauseAutoScroll, startAutoScroll]);

  return {
    isAutoScrolling,
    scrollProgress,
    startAutoScroll,
    pauseAutoScroll,
    resumeAutoScroll,
    resetScroll,
    toggleAutoScroll,
  };
}
