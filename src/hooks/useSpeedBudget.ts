/**
 * CONTRACT 5C-2: Universal Skeleton & Placeholder Law
 * 
 * Hook for components to register and track their performance budgets.
 * Provides instant feedback and graceful degradation.
 * 
 * RULES:
 * - Skeletons are mandatory, not optional
 * - Skeleton must match final layout (zero CLS)
 * - Skeletons render before any async call
 * - No global spinners allowed (ever)
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import {
  InteractionType,
  THRESHOLDS,
  getBudgetStatus,
  BudgetStatus,
  DEGRADATION_RULES,
} from '@/lib/performanceBudget';
import {
  startTiming,
  endTiming,
  shouldDegrade,
  getDegradationAction,
} from '@/lib/performanceGuardian';
import { createLogger } from '@/lib/logger';

const logger = createLogger('useSpeedBudget');

// ============= TYPES =============

interface UseSpeedBudgetOptions {
  type: InteractionType;
  component: string;
  autoStart?: boolean;       // Start timing on mount
  autoDegradeUI?: boolean;   // Auto-switch to degraded UI
}

interface UseSpeedBudgetReturn {
  // Timing controls
  start: () => void;
  end: () => void;
  
  // Status
  isWithinBudget: boolean;
  status: BudgetStatus;
  elapsed: number;
  
  // Degradation
  shouldShowSkeleton: boolean;
  shouldShowCached: boolean;
  degradationAction: string;
  
  // Utilities
  markReady: () => void;
  markInteractive: () => void;
}

// ============= HOOK =============

export function useSpeedBudget({
  type,
  component,
  autoStart = true,
  autoDegradeUI = true,
}: UseSpeedBudgetOptions): UseSpeedBudgetReturn {
  const timerIdRef = useRef<string | null>(null);
  const startTimeRef = useRef<number>(0);
  const [elapsed, setElapsed] = useState(0);
  const [status, setStatus] = useState<BudgetStatus>('ok');
  const [isComplete, setIsComplete] = useState(false);
  const animationFrameRef = useRef<number | null>(null);
  
  // Start timing
  const start = useCallback(() => {
    if (timerIdRef.current) return; // Already started
    
    startTimeRef.current = performance.now();
    timerIdRef.current = startTiming(type, component);
    
    // Update elapsed time at 60fps for responsive UI
    const updateElapsed = () => {
      if (!timerIdRef.current) return;
      
      const now = performance.now();
      const currentElapsed = now - startTimeRef.current;
      setElapsed(currentElapsed);
      setStatus(getBudgetStatus(type, currentElapsed));
      
      animationFrameRef.current = requestAnimationFrame(updateElapsed);
    };
    
    animationFrameRef.current = requestAnimationFrame(updateElapsed);
  }, [type, component]);
  
  // End timing
  const end = useCallback(() => {
    if (!timerIdRef.current) return;
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    const measurement = endTiming(timerIdRef.current);
    timerIdRef.current = null;
    setIsComplete(true);
    
    if (measurement) {
      setElapsed(measurement.duration || 0);
      setStatus(measurement.status);
      
      logger.debug(`${component} completed in ${measurement.duration?.toFixed(0)}ms (${measurement.status})`);
    }
  }, [component]);
  
  // Mark component as ready (content loaded)
  const markReady = useCallback(() => {
    end();
  }, [end]);
  
  // Mark component as interactive (user can interact)
  const markInteractive = useCallback(() => {
    // This is the critical point - user can now interact
    end();
  }, [end]);
  
  // Auto-start on mount
  useEffect(() => {
    if (autoStart) {
      start();
    }
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (timerIdRef.current) {
        end();
      }
    };
  }, [autoStart, start, end]);
  
  // Calculate derived values
  const threshold = THRESHOLDS[type];
  const isWithinBudget = status === 'ok' || isComplete;
  const shouldShowSkeleton = autoDegradeUI && !isComplete && elapsed < threshold.degradeAt;
  const shouldShowCached = autoDegradeUI && shouldDegrade(type, elapsed);
  const degradationAction = getDegradationAction(type).action;
  
  return {
    start,
    end,
    isWithinBudget,
    status,
    elapsed,
    shouldShowSkeleton,
    shouldShowCached,
    degradationAction,
    markReady,
    markInteractive,
  };
}

// ============= QUICK UTILITIES =============

/**
 * Hook for instant button feedback
 * Returns handlers that provide immediate visual feedback
 */
export function useButtonFeedback() {
  const [isPending, setIsPending] = useState(false);
  
  const handleClick = useCallback(
    async (asyncAction: () => Promise<void>) => {
      // Immediate visual feedback
      setIsPending(true);
      
      // Queue actual action (Rule 5C-4: allow + queue)
      try {
        await asyncAction();
      } finally {
        setIsPending(false);
      }
    },
    []
  );
  
  return {
    isPending,
    handleClick,
  };
}

/**
 * Hook for modal pre-mounting
 * Ensures modal shell is visible before content loads
 */
export function useModalPreMount() {
  const [isShellReady, setIsShellReady] = useState(false);
  const [isContentReady, setIsContentReady] = useState(false);
  
  const mountShell = useCallback(() => {
    // Shell renders immediately
    setIsShellReady(true);
  }, []);
  
  const mountContent = useCallback(() => {
    // Content loads after shell
    setIsContentReady(true);
  }, []);
  
  return {
    isShellReady,
    isContentReady,
    mountShell,
    mountContent,
    showSkeleton: isShellReady && !isContentReady,
  };
}

/**
 * Hook for route change timing
 * Tracks navigation performance
 */
export function useRouteChangeTimer(routePath: string) {
  const { start, end, status, elapsed } = useSpeedBudget({
    type: 'route-change',
    component: `Route: ${routePath}`,
    autoStart: false,
  });
  
  useEffect(() => {
    start();
    
    // End timing after first paint
    const frameId = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        end();
      });
    });
    
    return () => cancelAnimationFrame(frameId);
  }, [routePath, start, end]);
  
  return { status, elapsed };
}
