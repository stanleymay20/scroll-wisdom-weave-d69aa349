/**
 * CONTRACT 5 — React Hooks for Performance, Reliability & Trust
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { 
  markFirstContent, 
  markInteractive,
  getConnectionState,
  recordConnectionCheck,
  setLoadingState,
  type ConnectionState,
  type LoadingState,
  SLA
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
 * Hook for honest connection state (Rule 5.3)
 */
export function useConnectionState(): {
  state: ConnectionState;
  isOnline: boolean;
  isUnstable: boolean;
  checkConnection: () => Promise<boolean>;
} {
  const [state, setState] = useState<ConnectionState>(() => getConnectionState());
  
  const checkConnection = useCallback(async (): Promise<boolean> => {
    const start = performance.now();
    try {
      // Try to fetch a small resource
      const response = await fetch('/manifest.webmanifest', {
        method: 'HEAD',
        cache: 'no-store',
      });
      const latency = performance.now() - start;
      const success = response.ok;
      
      recordConnectionCheck(success, '/manifest.webmanifest', latency);
      setState(getConnectionState());
      
      return success;
    } catch {
      recordConnectionCheck(false, '/manifest.webmanifest');
      setState(getConnectionState());
      return false;
    }
  }, []);
  
  // Periodic connection checks
  useEffect(() => {
    const interval = setInterval(checkConnection, 30000); // Check every 30s
    return () => clearInterval(interval);
  }, [checkConnection]);
  
  // Listen to browser online/offline events
  useEffect(() => {
    const handleOnline = () => checkConnection();
    const handleOffline = () => {
      recordConnectionCheck(false, 'browser-event');
      setState('offline');
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [checkConnection]);
  
  return {
    state,
    isOnline: state === 'online',
    isUnstable: state === 'unstable',
    checkConnection,
  };
}

/**
 * Hook for trust signals (Rule 5.7)
 * Shows loading/saving/generating states to users
 */
export function useTrustSignal(id: string): {
  state: LoadingState;
  setIdle: () => void;
  setLoading: () => void;
  setSaving: () => void;
  setGenerating: () => void;
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
    setError: () => updateState('error'),
  };
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
