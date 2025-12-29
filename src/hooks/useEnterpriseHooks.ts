/**
 * Custom React hooks for enterprise-grade data fetching
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createLogger } from '@/lib/logger';

const logger = createLogger('Hooks');

// ============= useAsync Hook =============

interface AsyncState<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
  status: 'idle' | 'loading' | 'success' | 'error';
}

interface UseAsyncOptions {
  immediate?: boolean;
  onSuccess?: (data: unknown) => void;
  onError?: (error: Error) => void;
}

/**
 * Hook for managing async operations with loading, error, and success states
 */
export function useAsync<T>(
  asyncFn: () => Promise<T>,
  options: UseAsyncOptions = {}
): AsyncState<T> & { execute: () => Promise<T | null>; reset: () => void } {
  const { immediate = true, onSuccess, onError } = options;
  
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    error: null,
    loading: immediate,
    status: immediate ? 'loading' : 'idle',
  });

  const mountedRef = useRef(true);

  const execute = useCallback(async (): Promise<T | null> => {
    setState((prev) => ({ ...prev, loading: true, status: 'loading', error: null }));
    
    try {
      const data = await asyncFn();
      
      if (mountedRef.current) {
        setState({ data, error: null, loading: false, status: 'success' });
        onSuccess?.(data);
      }
      
      return data;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      
      if (mountedRef.current) {
        setState({ data: null, error: err, loading: false, status: 'error' });
        onError?.(err);
        logger.error('useAsync failed', { message: err.message });
      }
      
      return null;
    }
  }, [asyncFn, onSuccess, onError]);

  const reset = useCallback(() => {
    setState({ data: null, error: null, loading: false, status: 'idle' });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    
    if (immediate) {
      execute();
    }
    
    return () => {
      mountedRef.current = false;
    };
  }, [immediate, execute]);

  return { ...state, execute, reset };
}

// ============= useDebounce Hook =============

/**
 * Debounce a value with specified delay
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

// ============= useThrottle Hook =============

/**
 * Throttle a callback function
 */
export function useThrottle<T extends (...args: unknown[]) => unknown>(
  callback: T,
  delay: number
): T {
  const lastRun = useRef<number>(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  return useCallback(
    (...args: Parameters<T>) => {
      const now = Date.now();
      const remaining = delay - (now - lastRun.current);

      if (remaining <= 0) {
        lastRun.current = now;
        callback(...args);
      } else if (!timeoutRef.current) {
        timeoutRef.current = setTimeout(() => {
          lastRun.current = Date.now();
          timeoutRef.current = undefined;
          callback(...args);
        }, remaining);
      }
    },
    [callback, delay]
  ) as T;
}

// ============= usePrevious Hook =============

/**
 * Get the previous value of a variable
 */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>();
  
  useEffect(() => {
    ref.current = value;
  }, [value]);
  
  return ref.current;
}

// ============= useLocalStorage Hook =============

/**
 * Persist state to localStorage
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') {
      return initialValue;
    }
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      logger.warn('Error reading localStorage', { key, error: String(error) });
      return initialValue;
    }
  });

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      try {
        const valueToStore = value instanceof Function ? value(storedValue) : value;
        setStoredValue(valueToStore);
        
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(key, JSON.stringify(valueToStore));
        }
      } catch (error) {
        logger.warn('Error writing to localStorage', { key, error: String(error) });
      }
    },
    [key, storedValue]
  );

  return [storedValue, setValue];
}

// ============= useOnClickOutside Hook =============

/**
 * Detect clicks outside of a ref element
 */
export function useOnClickOutside<T extends HTMLElement>(
  ref: React.RefObject<T>,
  handler: (event: MouseEvent | TouchEvent) => void
): void {
  useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      if (!ref.current || ref.current.contains(event.target as Node)) {
        return;
      }
      handler(event);
    };

    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);

    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [ref, handler]);
}

// ============= useMediaQuery Hook =============

/**
 * Check if a media query matches
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia(query).matches;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const mediaQuery = window.matchMedia(query);
    setMatches(mediaQuery.matches);

    const handler = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

// ============= useInterval Hook =============

/**
 * Set up an interval that's properly cleaned up
 */
export function useInterval(callback: () => void, delay: number | null): void {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delay === null) return;
    
    const id = setInterval(() => savedCallback.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}

// ============= useMounted Hook =============

/**
 * Check if component is still mounted (for async operations)
 */
export function useMounted(): () => boolean {
  const mounted = useRef(false);
  
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  
  return useCallback(() => mounted.current, []);
}
