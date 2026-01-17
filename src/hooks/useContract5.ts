/**
 * CONTRACT 5 (Enhanced) — React Hooks for Performance, Media, & UX Reliability
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { 
  markFirstContent, 
  markInteractive,
  markCacheRender,
  getConnectionState,
  recordConnectionCheck,
  setLoadingState,
  setAudioState,
  canPerformOnlineAction,
  getConnectionMessage,
  acknowledgeAction,
  type ConnectionState,
  type LoadingState,
  type AudioState,
  SLA,
  READER_CONSTRAINTS,
  AUDIO_CONSTRAINTS,
  OFFLINE_MESSAGES
} from '@/lib/contract5';

/**
 * Hook to track page load performance (Rule 5.1)
 * Ensures skeleton-first rendering and SLA compliance
 */
export function usePageLoadSLA(pageName: string): void {
  const hasMarkedFirstContent = useRef(false);
  const hasMarkedInteractive = useRef(false);
  
  // Mark first content on mount (skeleton shown)
  useEffect(() => {
    if (!hasMarkedFirstContent.current) {
      markFirstContent(pageName);
      hasMarkedFirstContent.current = true;
    }
  }, [pageName]);
  
  // Mark interactive after first render completes
  useEffect(() => {
    if (!hasMarkedInteractive.current) {
      // Use requestIdleCallback for accurate interactive timing
      const markIt = () => {
        markInteractive(pageName);
        hasMarkedInteractive.current = true;
      };
      
      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(markIt, { timeout: 100 });
      } else {
        setTimeout(markIt, 0);
      }
    }
  }, [pageName]);
}

/**
 * Hook for skeleton-first loading pattern (Rule 5.1, 5.4)
 * Returns loading state and ensures SLA compliance
 */
export function useSkeletonFirst<T>(
  fetchFn: () => Promise<T>,
  cacheKey?: string
): {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);
  
  const fetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await fetchFn();
      if (mountedRef.current) {
        setData(result);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [fetchFn]);
  
  useEffect(() => {
    mountedRef.current = true;
    // Defer fetch to not block first paint
    const timeoutId = setTimeout(fetch, 0);
    
    return () => {
      mountedRef.current = false;
      clearTimeout(timeoutId);
    };
  }, [fetch]);
  
  return { data, isLoading, error, refetch: fetch };
}

/**
 * Hook for honest connection state (Rule 5.5 - Honest Offline)
 * 
 * FIXED: Uses optimistic online detection to prevent false offline states.
 * - Trusts navigator.onLine as primary indicator
 * - Only marks as offline after confirmed failures
 * - Avoids false positives that hurt UX
 */
export function useConnectionState(): {
  state: ConnectionState;
  isOnline: boolean;
  isUnstable: boolean;
  isOffline: boolean;
  message: string | null;
  checkConnection: () => Promise<boolean>;
  canPerformAction: () => { allowed: boolean; message?: string };
} {
  // Start with browser's online state (optimistic)
  const [state, setState] = useState<ConnectionState>(() => 
    navigator.onLine ? 'online' : 'offline'
  );
  
  // Track consecutive failures to prevent false positives
  const failureCountRef = useRef(0);
  const lastCheckRef = useRef(0);
  
  const checkConnection = useCallback(async (): Promise<boolean> => {
    // Throttle checks to prevent spam
    const now = Date.now();
    if (now - lastCheckRef.current < 5000) {
      return state === 'online';
    }
    lastCheckRef.current = now;
    
    // If browser says offline, trust it
    if (!navigator.onLine) {
      setState('offline');
      recordConnectionCheck(false, 'navigator');
      return false;
    }
    
    const start = performance.now();
    try {
      // Try to fetch a small resource with short timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      const response = await fetch('/manifest.webmanifest', {
        method: 'HEAD',
        cache: 'no-store',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      const latency = performance.now() - start;
      const success = response.ok;
      
      if (success) {
        failureCountRef.current = 0;
        setState('online');
      } else {
        failureCountRef.current++;
        // Only mark as unstable/offline after multiple failures
        if (failureCountRef.current >= 3) {
          setState('offline');
        } else if (failureCountRef.current >= 2) {
          setState('unstable');
        }
      }
      
      recordConnectionCheck(success, '/manifest.webmanifest', latency);
      return success;
    } catch {
      failureCountRef.current++;
      
      // Only mark offline after 3+ consecutive failures
      // This prevents false offline states from single failed requests
      if (failureCountRef.current >= 3) {
        setState('offline');
      } else if (failureCountRef.current >= 2 && navigator.onLine) {
        setState('unstable');
      }
      
      recordConnectionCheck(false, '/manifest.webmanifest');
      
      // Still return true if browser says online and we haven't confirmed offline
      return navigator.onLine && failureCountRef.current < 3;
    }
  }, [state]);
  
  const canPerformAction = useCallback(() => {
    // Be optimistic - allow action if browser says online
    if (navigator.onLine && state !== 'offline') {
      return { allowed: true };
    }
    return canPerformOnlineAction();
  }, [state]);
  
  // Less aggressive connection checks - only every 60s
  useEffect(() => {
    // Initial check only if browser says offline
    if (!navigator.onLine) {
      checkConnection();
    }
    
    const interval = setInterval(checkConnection, 60000);
    return () => clearInterval(interval);
  }, [checkConnection]);
  
  // Listen to browser online/offline events (most reliable)
  useEffect(() => {
    const handleOnline = () => {
      failureCountRef.current = 0;
      setState('online');
      recordConnectionCheck(true, 'browser-event');
    };
    
    const handleOffline = () => {
      setState('offline');
      recordConnectionCheck(false, 'browser-event');
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  
  return {
    state,
    isOnline: state === 'online' || navigator.onLine,
    isUnstable: state === 'unstable',
    isOffline: state === 'offline' && !navigator.onLine,
    message: state === 'online' ? null : getConnectionMessage(),
    checkConnection,
    canPerformAction,
  };
}

/**
 * Hook for trust signals (Rule 5.7 - User Trust Signals)
 * Shows loading/saving/generating/buffering states to users
 */
export function useTrustSignal(id: string): {
  state: LoadingState;
  setIdle: () => void;
  setLoading: () => void;
  setSaving: () => void;
  setGenerating: () => void;
  setBuffering: () => void;
  setError: () => void;
} {
  const [state, setLocalState] = useState<LoadingState>('idle');
  
  const updateState = useCallback((newState: LoadingState) => {
    setLocalState(newState);
    setLoadingState(id, newState);
  }, [id]);
  
  return {
    state,
    setIdle: () => updateState('idle'),
    setLoading: () => updateState('loading'),
    setSaving: () => updateState('saving'),
    setGenerating: () => updateState('generating'),
    setBuffering: () => updateState('buffering'),
    setError: () => updateState('error'),
  };
}

/**
 * Hook for audio trust signals (Rule 5.3 - Audio First-Class)
 */
export function useAudioTrustSignal(id: string): {
  state: AudioState;
  setIdle: () => void;
  setPlaying: () => void;
  setPaused: () => void;
  setBuffering: () => void;
  setError: () => void;
} {
  const [state, setLocalState] = useState<AudioState>('idle');
  
  const updateState = useCallback((newState: AudioState) => {
    setLocalState(newState);
    setAudioState(id, newState);
  }, [id]);
  
  return {
    state,
    setIdle: () => updateState('idle'),
    setPlaying: () => updateState('playing'),
    setPaused: () => updateState('paused'),
    setBuffering: () => updateState('buffering'),
    setError: () => updateState('error'),
  };
}

/**
 * Hook for immediate action acknowledgment (Rule 5.6 - Perceived Performance)
 * Every user action must be acknowledged within 100ms
 */
export function useActionAcknowledgment(): {
  acknowledge: (actionId: string) => () => void;
  isAcknowledging: (actionId: string) => boolean;
} {
  const [activeActions, setActiveActions] = useState<Set<string>>(new Set());
  
  const acknowledge = useCallback((actionId: string) => {
    setActiveActions(prev => new Set([...prev, actionId]));
    const complete = acknowledgeAction(actionId);
    
    return () => {
      complete();
      setActiveActions(prev => {
        const next = new Set(prev);
        next.delete(actionId);
        return next;
      });
    };
  }, []);
  
  const isAcknowledging = useCallback((actionId: string) => {
    return activeActions.has(actionId);
  }, [activeActions]);
  
  return { acknowledge, isAcknowledging };
}

/**
 * Hook to enforce cache-first pattern (Rule 5.4)
 */
export function useCacheFirst<T>(
  cacheKey: string,
  fetchFn: () => Promise<T>,
  cacheInstance: {
    get: (key: string) => T | null;
    set: (key: string, value: T, ttl?: number) => void;
  },
  ttlMs: number = 60000
): {
  data: T | null;
  isLoading: boolean;
  isFromCache: boolean;
  error: Error | null;
} {
  const [data, setData] = useState<T | null>(() => cacheInstance.get(cacheKey));
  const [isLoading, setIsLoading] = useState(data === null);
  const [isFromCache, setIsFromCache] = useState(data !== null);
  const [error, setError] = useState<Error | null>(null);
  
  useEffect(() => {
    let mounted = true;
    
    // If we have cached data, show it immediately
    const cached = cacheInstance.get(cacheKey);
    if (cached) {
      setData(cached);
      setIsFromCache(true);
      setIsLoading(false);
    }
    
    // Fetch fresh data in background
    const fetchData = async () => {
      try {
        const result = await fetchFn();
        if (mounted) {
          setData(result);
          setIsFromCache(false);
          cacheInstance.set(cacheKey, result, ttlMs);
        }
      } catch (err) {
        if (mounted && !cached) {
          // Only show error if we don't have cached data
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };
    
    // Defer fetch to after first paint
    setTimeout(fetchData, 0);
    
    return () => { mounted = false; };
  }, [cacheKey, fetchFn, cacheInstance, ttlMs]);
  
  return { data, isLoading, isFromCache, error };
}
