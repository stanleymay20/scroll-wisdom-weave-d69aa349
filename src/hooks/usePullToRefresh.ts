/**
 * CONTRACT 5 - Rule 5.1: Pull-to-Refresh for Native Mobile UX
 * 
 * Provides a native-feeling pull-to-refresh gesture for mobile pages.
 * Shows visual feedback during pull and triggers refresh on release.
 */

import { useState, useCallback, useRef, useEffect } from 'react';

interface PullToRefreshOptions {
  /** Callback when refresh is triggered */
  onRefresh: () => Promise<void>;
  /** Minimum pull distance to trigger refresh (default: 80px) */
  threshold?: number;
  /** Maximum pull distance (default: 120px) */
  maxPull?: number;
  /** Whether pull-to-refresh is enabled (default: true) */
  enabled?: boolean;
}

interface PullToRefreshState {
  /** Whether currently pulling */
  isPulling: boolean;
  /** Current pull distance in pixels */
  pullDistance: number;
  /** Whether refresh is in progress */
  isRefreshing: boolean;
  /** Progress percentage (0-100) */
  progress: number;
}

export function usePullToRefresh({
  onRefresh,
  threshold = 80,
  maxPull = 120,
  enabled = true,
}: PullToRefreshOptions) {
  const [state, setState] = useState<PullToRefreshState>({
    isPulling: false,
    pullDistance: 0,
    isRefreshing: false,
    progress: 0,
  });

  const startYRef = useRef(0);
  const currentYRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const isActiveRef = useRef(false);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!enabled || state.isRefreshing) return;
    
    // Only activate if at top of scroll
    const container = containerRef.current;
    if (!container) return;
    
    const scrollTop = container.scrollTop || window.scrollY;
    if (scrollTop > 5) return; // Allow small threshold
    
    startYRef.current = e.touches[0].clientY;
    isActiveRef.current = true;
  }, [enabled, state.isRefreshing]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isActiveRef.current || !enabled || state.isRefreshing) return;
    
    currentYRef.current = e.touches[0].clientY;
    const diff = currentYRef.current - startYRef.current;
    
    // Only pull down, not up
    if (diff < 0) {
      isActiveRef.current = false;
      return;
    }
    
    // Apply resistance for natural feel
    const resistance = 0.5;
    const pullDistance = Math.min(diff * resistance, maxPull);
    const progress = Math.min((pullDistance / threshold) * 100, 100);
    
    setState(prev => ({
      ...prev,
      isPulling: true,
      pullDistance,
      progress,
    }));
    
    // Prevent default scrolling when pulling
    if (pullDistance > 10) {
      e.preventDefault();
    }
  }, [enabled, state.isRefreshing, threshold, maxPull]);

  const handleTouchEnd = useCallback(async () => {
    if (!isActiveRef.current || !enabled) return;
    
    isActiveRef.current = false;
    
    const shouldRefresh = state.pullDistance >= threshold;
    
    if (shouldRefresh) {
      setState(prev => ({
        ...prev,
        isRefreshing: true,
        isPulling: false,
        pullDistance: threshold * 0.6, // Keep indicator visible during refresh
      }));
      
      try {
        await onRefresh();
      } catch (error) {
        console.error('[PullToRefresh] Refresh error:', error);
      }
    }
    
    // Reset state
    setState({
      isPulling: false,
      pullDistance: 0,
      isRefreshing: false,
      progress: 0,
    });
  }, [enabled, state.pullDistance, threshold, onRefresh]);

  // Attach touch listeners
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    const options = { passive: false };
    
    container.addEventListener('touchstart', handleTouchStart, options);
    container.addEventListener('touchmove', handleTouchMove, options);
    container.addEventListener('touchend', handleTouchEnd);
    container.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [enabled, handleTouchStart, handleTouchMove, handleTouchEnd]);

  return {
    containerRef,
    ...state,
  };
}
