/**
 * CONTRACT 5 - Rule 5.2: Reader UI Immersion
 * 
 * Floating actions auto-hide while scrolling and reappear on user intent (tap/pause)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { READER_CONSTRAINTS } from '@/lib/contract5';

interface UseAutoHideOptions {
  /** Hide after this many px of scroll (default: 50) */
  scrollThreshold?: number;
  /** Show again after this many ms of no scroll (default: 1500) */
  pauseMs?: number;
  /** Initial visibility state (default: true) */
  initialVisible?: boolean;
}

export function useAutoHideFloatingActions(options: UseAutoHideOptions = {}) {
  const {
    scrollThreshold = READER_CONSTRAINTS.scrollHideThreshold,
    pauseMs = 1500,
    initialVisible = true,
  } = options;

  const [isVisible, setIsVisible] = useState(initialVisible);
  const lastScrollY = useRef(0);
  const scrollDirection = useRef<'up' | 'down'>('down');
  const pauseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isScrolling = useRef(false);

  const handleScroll = useCallback(() => {
    const currentScrollY = window.scrollY;
    const delta = currentScrollY - lastScrollY.current;
    
    // Determine scroll direction
    if (Math.abs(delta) > 5) {
      scrollDirection.current = delta > 0 ? 'down' : 'up';
    }
    
    // Hide on significant scroll down
    if (delta > scrollThreshold && scrollDirection.current === 'down') {
      setIsVisible(false);
      isScrolling.current = true;
    }
    
    // Show immediately on scroll up
    if (delta < -10 && scrollDirection.current === 'up') {
      setIsVisible(true);
    }
    
    // Clear existing pause timeout
    if (pauseTimeoutRef.current) {
      clearTimeout(pauseTimeoutRef.current);
    }
    
    // Set timeout to show after pause
    pauseTimeoutRef.current = setTimeout(() => {
      setIsVisible(true);
      isScrolling.current = false;
    }, pauseMs);
    
    lastScrollY.current = currentScrollY;
  }, [scrollThreshold, pauseMs]);

  // Show on tap/touch anywhere
  const handleTap = useCallback(() => {
    if (!isVisible) {
      setIsVisible(true);
    }
  }, [isVisible]);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('touchstart', handleTap, { passive: true });
    window.addEventListener('click', handleTap);
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('touchstart', handleTap);
      window.removeEventListener('click', handleTap);
      
      if (pauseTimeoutRef.current) {
        clearTimeout(pauseTimeoutRef.current);
      }
    };
  }, [handleScroll, handleTap]);

  // Force show (for programmatic control)
  const show = useCallback(() => setIsVisible(true), []);
  const hide = useCallback(() => setIsVisible(false), []);

  return {
    isVisible,
    show,
    hide,
    isScrolling: isScrolling.current,
  };
}
