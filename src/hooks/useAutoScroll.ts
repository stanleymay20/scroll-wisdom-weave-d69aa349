/**
 * Auto-Scroll Hook for Audio Sync
 * 
 * Synchronizes page scroll with audio playback:
 * - Calculates scroll speed based on content length
 * - Smooth scrolling that follows audio progress
 * - Pause/resume with audio state
 * 
 * FIXES:
 * - Removed circular dependency in useEffect
 * - Uses refs to avoid stale closures
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

  // Keep refs in sync
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

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
  }, [estimatedDurationMs]);

  // Start auto-scrolling
  const startAutoScroll = useCallback(() => {
    if (!enabledRef.current || !contentRef.current) return;

    const params = getScrollParams();
    if (!params || params.scrollHeight <= 0) return;

    setIsAutoScrolling(true);
    
    // Calculate start time accounting for paused time
    const now = performance.now();
    if (pausedTimeRef.current > 0) {
      // Resume from where we paused
      startTimeRef.current = now - pausedTimeRef.current;
    } else {
      startTimeRef.current = now;
    }

    const animate = (currentTime: number) => {
      if (!contentRef.current || !isPlayingRef.current) {
        return;
      }

      const elapsed = currentTime - startTimeRef.current;
      const progress = Math.min(elapsed / params.duration, 1);
      
      // Linear scrolling for predictable sync with audio
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

  // Pause auto-scrolling
  const pauseAutoScroll = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = undefined;
    }
    
    // Save the elapsed time so we can resume
    if (startTimeRef.current > 0) {
      pausedTimeRef.current = performance.now() - startTimeRef.current;
    }
    
    setIsAutoScrolling(false);
  }, []);

  // Reset scroll position
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

  // Toggle auto-scroll
  const toggleAutoScroll = useCallback(() => {
    if (isAutoScrolling) {
      pauseAutoScroll();
    } else {
      startAutoScroll();
    }
  }, [isAutoScrolling, pauseAutoScroll, startAutoScroll]);

  // Sync with audio playing state - NO circular deps
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
  }, [isPlaying, enabled]); // Only depend on the actual state values

  // Handle manual scroll interruption
  useEffect(() => {
    const element = contentRef.current;
    if (!element || !isAutoScrolling) return;

    let lastScrollTop = element.scrollTop;
    let manualScrollTimeout: ReturnType<typeof setTimeout>;
    let isUserScrolling = false;

    const handleScroll = () => {
      const currentScrollTop = element.scrollTop;
      const scrollDiff = Math.abs(currentScrollTop - lastScrollTop);
      
      // If user scrolls significantly (more than auto-scroll would), pause temporarily
      if (scrollDiff > 10 && !isUserScrolling) {
        isUserScrolling = true;
        pauseAutoScroll();
        
        // Resume after 3 seconds of no manual scroll
        clearTimeout(manualScrollTimeout);
        manualScrollTimeout = setTimeout(() => {
          isUserScrolling = false;
          if (isPlayingRef.current && enabledRef.current) {
            // Resume from current position
            pausedTimeRef.current = 0; // Reset paused time to start from current pos
            const params = getScrollParams();
            if (params && params.scrollHeight > 0) {
              // Calculate what percentage we're at based on current scroll
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
  }, [isAutoScrolling, pauseAutoScroll, getScrollParams]);

  return {
    isAutoScrolling,
    scrollProgress,
    startAutoScroll,
    pauseAutoScroll,
    resetScroll,
    toggleAutoScroll,
  };
}
