/**
 * CONTRACT 5D: Interaction Integrity Hook
 * 
 * Hook for managing action lifecycles with guaranteed feedback.
 * 
 * RULES:
 * - 5D-1: Every action follows INTENT → ACKNOWLEDGED → IN_PROGRESS → RESOLVED
 * - 5D-2: Async stall protection with visual feedback
 * - 5D-3: Retry, resume, recover support
 * - 5D-4: User-facing resolution feedback always shown
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import {
  ActionLifecycle,
  ActionType,
  ActionState,
  createActionLifecycle,
  transitionAction,
  getStallStatus,
  createResolution,
  ACTION_CONFIG,
  ACTION_TIMEOUTS,
  emitActionEvent,
  StallStatus,
} from '@/lib/actionLifecycle';
import { createLogger } from '@/lib/logger';

const logger = createLogger('useActionLifecycle');

// ============= TYPES =============

interface UseActionLifecycleOptions {
  type: ActionType;
  onSuccess?: (result: unknown) => void;
  onError?: (error: Error) => void;
  onTimeout?: () => void;
  onCancel?: () => void;
  showToasts?: boolean;
  metadata?: Record<string, unknown>;
}

interface UseActionLifecycleReturn {
  // State
  action: ActionLifecycle;
  state: ActionState;
  isIdle: boolean;
  isPending: boolean;
  isResolved: boolean;
  isFailed: boolean;
  stallStatus: StallStatus;
  
  // Execution
  execute: <T>(asyncFn: () => Promise<T>) => Promise<T | null>;
  
  // Controls
  retry: () => void;
  cancel: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  
  // Progress
  setProgress: (progress: number, message?: string) => void;
  setMessage: (message: string) => void;
}

// ============= HOOK =============

export function useActionLifecycle({
  type,
  onSuccess,
  onError,
  onTimeout,
  onCancel,
  showToasts = true,
  metadata,
}: UseActionLifecycleOptions): UseActionLifecycleReturn {
  const [action, setAction] = useState<ActionLifecycle>(() => 
    createActionLifecycle(type, metadata)
  );
  const [stallStatus, setStallStatus] = useState<StallStatus>({
    isStalled: false,
    duration: 0,
    shouldShowWorking: false,
    shouldShowStatus: false,
    shouldOfferRetry: false,
    shouldAutoTimeout: false,
    timeUntilTimeout: 0,
  });
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastAsyncFnRef = useRef<(() => Promise<unknown>) | null>(null);
  const stallIntervalRef = useRef<number | null>(null);
  const toastIdRef = useRef<string | number | null>(null);
  
  // Stall detection interval
  useEffect(() => {
    if (['in_progress', 'acknowledged'].includes(action.state)) {
      stallIntervalRef.current = window.setInterval(() => {
        const status = getStallStatus(action);
        setStallStatus(status);
        
        // Auto-timeout check
        if (status.shouldAutoTimeout && action.state === 'in_progress') {
          handleTimeout();
        }
        
        // Update toast for long-running operations
        if (status.shouldShowStatus && toastIdRef.current && showToasts) {
          toast.loading(`Still working... (${Math.round(status.duration / 1000)}s)`, {
            id: toastIdRef.current,
          });
        }
      }, 500);
    } else {
      if (stallIntervalRef.current) {
        clearInterval(stallIntervalRef.current);
        stallIntervalRef.current = null;
      }
    }
    
    return () => {
      if (stallIntervalRef.current) {
        clearInterval(stallIntervalRef.current);
      }
    };
  }, [action.state, action.startedAt, showToasts]);
  
  // Handle timeout
  const handleTimeout = useCallback(() => {
    setAction(prev => transitionAction(prev, 'timeout', { 
      error: 'Operation timed out' 
    }));
    
    if (showToasts && toastIdRef.current) {
      toast.dismiss(toastIdRef.current);
    }
    
    const resolution = createResolution('timeout', {
      actionType: type,
      retryHandler: () => retry(),
    });
    
    if (showToasts) {
      toast.error(resolution.title, {
        description: resolution.message,
        action: resolution.action ? {
          label: resolution.action.label,
          onClick: resolution.action.handler,
        } : undefined,
      });
    }
    
    emitActionEvent(action, 'timeout');
    onTimeout?.();
  }, [type, showToasts, onTimeout]);
  
  // Execute action with full lifecycle
  const execute = useCallback(async <T,>(asyncFn: () => Promise<T>): Promise<T | null> => {
    lastAsyncFnRef.current = asyncFn as () => Promise<unknown>;
    abortControllerRef.current = new AbortController();
    
    // INTENT
    setAction(prev => transitionAction(prev, 'intent'));
    
    // ACKNOWLEDGED (immediate - ≤100ms)
    const acknowledgeStart = performance.now();
    setAction(prev => transitionAction(prev, 'acknowledged', {
      message: 'Starting...',
    }));
    
    if (showToasts) {
      toastIdRef.current = toast.loading('Processing...', {
        id: toastIdRef.current || undefined,
      });
    }
    
    const acknowledgeTime = performance.now() - acknowledgeStart;
    if (acknowledgeTime > ACTION_TIMEOUTS.ACKNOWLEDGE) {
      logger.warn(`Acknowledge took ${acknowledgeTime.toFixed(0)}ms (budget: ${ACTION_TIMEOUTS.ACKNOWLEDGE}ms)`);
    }
    
    emitActionEvent(action, 'acknowledged');
    
    // IN_PROGRESS
    setAction(prev => transitionAction(prev, 'in_progress'));
    emitActionEvent(action, 'started');
    
    try {
      const result = await asyncFn();
      
      // Check if cancelled
      if (abortControllerRef.current?.signal.aborted) {
        return null;
      }
      
      // RESOLVED
      setAction(prev => transitionAction(prev, 'resolved', {
        message: 'Complete!',
      }));
      
      if (showToasts && toastIdRef.current) {
        toast.dismiss(toastIdRef.current);
        const resolution = createResolution('success', { actionType: type });
        toast.success(resolution.title, {
          description: resolution.message,
        });
      }
      
      emitActionEvent(action, 'resolved');
      onSuccess?.(result);
      
      return result;
      
    } catch (error) {
      // Check if cancelled
      if (abortControllerRef.current?.signal.aborted) {
        return null;
      }
      
      const errorMessage = error instanceof Error ? error.message : 'An error occurred';
      
      // FAILED
      setAction(prev => {
        const newAction = transitionAction(prev, 'failed', {
          error: errorMessage,
        });
        // Increment retry count
        return { ...newAction, retryCount: newAction.retryCount + 1 };
      });
      
      if (showToasts && toastIdRef.current) {
        toast.dismiss(toastIdRef.current);
        const resolution = createResolution('failed', {
          actionType: type,
          error: errorMessage,
          retryHandler: () => retry(),
        });
        toast.error(resolution.title, {
          description: resolution.message,
          action: resolution.action ? {
            label: resolution.action.label,
            onClick: resolution.action.handler,
          } : undefined,
        });
      }
      
      emitActionEvent(action, 'failed');
      onError?.(error instanceof Error ? error : new Error(errorMessage));
      
      return null;
    }
  }, [type, showToasts, onSuccess, onError]);
  
  // Retry last action
  const retry = useCallback(() => {
    if (!lastAsyncFnRef.current || !action.canRetry) {
      logger.warn('Cannot retry: no previous action or max retries exceeded');
      return;
    }
    
    if (action.retryCount >= action.maxRetries) {
      logger.warn(`Max retries (${action.maxRetries}) exceeded`);
      return;
    }
    
    logger.debug(`Retrying action (attempt ${action.retryCount + 1}/${action.maxRetries})`);
    execute(lastAsyncFnRef.current as () => Promise<unknown>);
  }, [action.canRetry, action.retryCount, action.maxRetries, execute]);
  
  // Cancel action
  const cancel = useCallback(() => {
    if (!action.canCancel) {
      logger.warn('Action cannot be cancelled');
      return;
    }
    
    abortControllerRef.current?.abort();
    
    setAction(prev => transitionAction(prev, 'cancelled'));
    
    if (showToasts && toastIdRef.current) {
      toast.dismiss(toastIdRef.current);
      toast.info('Action cancelled');
    }
    
    emitActionEvent(action, 'cancelled');
    onCancel?.();
  }, [action.canCancel, showToasts, onCancel]);
  
  // Pause action
  const pause = useCallback(() => {
    if (!action.canResume) {
      logger.warn('Action cannot be paused');
      return;
    }
    
    setAction(prev => transitionAction(prev, 'paused'));
    
    if (showToasts && toastIdRef.current) {
      toast.info('Action paused', {
        id: toastIdRef.current,
      });
    }
  }, [action.canResume, showToasts]);
  
  // Resume action
  const resume = useCallback(() => {
    if (action.state !== 'paused') {
      logger.warn('Cannot resume: action not paused');
      return;
    }
    
    setAction(prev => transitionAction(prev, 'in_progress'));
    
    if (showToasts && toastIdRef.current) {
      toast.loading('Resuming...', {
        id: toastIdRef.current,
      });
    }
  }, [action.state, showToasts]);
  
  // Reset to idle
  const reset = useCallback(() => {
    setAction(createActionLifecycle(type, metadata));
    lastAsyncFnRef.current = null;
    abortControllerRef.current = null;
    toastIdRef.current = null;
    setStallStatus({
      isStalled: false,
      duration: 0,
      shouldShowWorking: false,
      shouldShowStatus: false,
      shouldOfferRetry: false,
      shouldAutoTimeout: false,
      timeUntilTimeout: 0,
    });
  }, [type, metadata]);
  
  // Set progress
  const setProgress = useCallback((progress: number, message?: string) => {
    setAction(prev => transitionAction(prev, prev.state, {
      progress: Math.min(100, Math.max(0, progress)),
      message,
    }));
    
    if (showToasts && toastIdRef.current && message) {
      toast.loading(`${message} (${progress}%)`, {
        id: toastIdRef.current,
      });
    }
  }, [showToasts]);
  
  // Set message
  const setMessage = useCallback((message: string) => {
    setAction(prev => transitionAction(prev, prev.state, { message }));
  }, []);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      if (stallIntervalRef.current) {
        clearInterval(stallIntervalRef.current);
      }
    };
  }, []);
  
  return {
    action,
    state: action.state,
    isIdle: action.state === 'idle',
    isPending: ['intent', 'acknowledged', 'in_progress'].includes(action.state),
    isResolved: action.state === 'resolved',
    isFailed: action.state === 'failed',
    stallStatus,
    execute,
    retry,
    cancel,
    pause,
    resume,
    reset,
    setProgress,
    setMessage,
  };
}

// ============= SIMPLE ACTION WRAPPER =============

/**
 * Simple wrapper for actions that just need lifecycle tracking
 */
export function useSimpleAction(type: ActionType) {
  return useActionLifecycle({ type });
}
