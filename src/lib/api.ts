/**
 * Enterprise-grade API client with retry, timeout, and error handling
 */

import { supabase } from '@/integrations/supabase/client';
import { createLogger } from './logger';

const logger = createLogger('API');

// ============= Types =============

export interface ApiResponse<T> {
  data: T | null;
  error: ApiError | null;
  status: 'success' | 'error';
}

export interface ApiError {
  code: string;
  message: string;
  details?: string;
  retryable: boolean;
}

interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

interface RequestConfig {
  timeout?: number;
  retries?: number;
  signal?: AbortSignal;
}

// ============= Constants =============

const DEFAULT_TIMEOUT = 30000; // 30 seconds
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
};

// Retryable error codes
const RETRYABLE_CODES = new Set([
  'TIMEOUT',
  'NETWORK_ERROR',
  'SERVICE_UNAVAILABLE',
  '429', // Rate limited
  '503', // Service unavailable
  '504', // Gateway timeout
]);

// ============= Error Handling =============

/**
 * Normalize any error into ApiError format
 */
export function normalizeError(error: unknown): ApiError {
  if (error instanceof Error) {
    // Check for abort errors
    if (error.name === 'AbortError') {
      return {
        code: 'TIMEOUT',
        message: 'Request timed out',
        retryable: true,
      };
    }

    // Check for network errors
    if (error.message.includes('fetch') || error.message.includes('network')) {
      return {
        code: 'NETWORK_ERROR',
        message: 'Network error - please check your connection',
        retryable: true,
      };
    }

    return {
      code: 'UNKNOWN_ERROR',
      message: error.message,
      retryable: false,
    };
  }

  // Handle Supabase errors
  if (typeof error === 'object' && error !== null) {
    const supaError = error as { code?: string; message?: string; details?: string };
    return {
      code: supaError.code ?? 'SUPABASE_ERROR',
      message: supaError.message ?? 'An error occurred',
      details: supaError.details,
      retryable: RETRYABLE_CODES.has(supaError.code ?? ''),
    };
  }

  return {
    code: 'UNKNOWN_ERROR',
    message: String(error),
    retryable: false,
  };
}

/**
 * Calculate exponential backoff delay
 */
function calculateBackoff(attempt: number, config: RetryConfig): number {
  const delay = Math.min(
    config.baseDelayMs * Math.pow(2, attempt),
    config.maxDelayMs
  );
  // Add jitter (±25%)
  const jitter = delay * 0.25 * (Math.random() * 2 - 1);
  return Math.round(delay + jitter);
}

/**
 * Sleep for specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============= Edge Function Client =============

/**
 * Invoke Supabase Edge Function with enterprise-grade error handling
 */
export async function invokeEdgeFunction<T>(
  functionName: string,
  payload: Record<string, unknown>,
  config: RequestConfig = {}
): Promise<ApiResponse<T>> {
  const { timeout = DEFAULT_TIMEOUT, retries = DEFAULT_RETRY_CONFIG.maxRetries } = config;
  
  let lastError: ApiError | null = null;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      logger.debug(`Invoking ${functionName}`, { attempt: attempt + 1, maxAttempts: retries + 1 });
      
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: payload,
      });
      
      clearTimeout(timeoutId);
      
      if (error) {
        throw error;
      }
      
      logger.info(`${functionName} succeeded`, { attempt: attempt + 1 });
      
      return {
        data: data as T,
        error: null,
        status: 'success',
      };
    } catch (error) {
      lastError = normalizeError(error);
      
      logger.warn(`${functionName} failed`, { 
        attempt: attempt + 1, 
        error: lastError.message,
        retryable: lastError.retryable,
      });
      
      // Don't retry non-retryable errors
      if (!lastError.retryable || attempt >= retries) {
        break;
      }
      
      // Wait before retry
      const delay = calculateBackoff(attempt, DEFAULT_RETRY_CONFIG);
      logger.debug(`Retrying ${functionName} in ${delay}ms`);
      await sleep(delay);
    }
  }
  
  logger.error(`${functionName} failed permanently`, { error: lastError });
  
  return {
    data: null,
    error: lastError,
    status: 'error',
  };
}

// ============= Database Helpers =============

/**
 * Execute database query with error handling
 */
export async function executeQuery<T>(
  queryFn: () => PromiseLike<{ data: T | null; error: unknown }>
): Promise<ApiResponse<T>> {
  try {
    const { data, error } = await queryFn();
    
    if (error) {
      return {
        data: null,
        error: normalizeError(error),
        status: 'error',
      };
    }
    
    return {
      data,
      error: null,
      status: 'success',
    };
  } catch (error) {
    return {
      data: null,
      error: normalizeError(error),
      status: 'error',
    };
  }
}

// ============= Request Deduplication =============

const pendingRequests = new Map<string, Promise<ApiResponse<unknown>>>();

/**
 * Deduplicate identical requests that are in-flight
 */
export async function deduplicatedRequest<T>(
  key: string,
  requestFn: () => Promise<ApiResponse<T>>
): Promise<ApiResponse<T>> {
  // Check for existing request
  const existing = pendingRequests.get(key);
  if (existing) {
    logger.debug('Request deduplicated', { key });
    return existing as Promise<ApiResponse<T>>;
  }
  
  // Create new request
  const request = requestFn().finally(() => {
    pendingRequests.delete(key);
  });
  
  pendingRequests.set(key, request as Promise<ApiResponse<unknown>>);
  return request;
}

// ============= Health Check =============

/**
 * Check API health status
 */
export async function checkApiHealth(): Promise<{
  healthy: boolean;
  latency: number;
  details: Record<string, boolean>;
}> {
  const start = performance.now();
  const details: Record<string, boolean> = {};
  
  try {
    // Check Supabase connection
    const { error: dbError } = await supabase.from('faqs').select('id').limit(1);
    details.database = !dbError;
    
    // Check auth service
    const { error: authError } = await supabase.auth.getSession();
    details.auth = !authError;
    
  } catch {
    details.database = false;
    details.auth = false;
  }
  
  const latency = Math.round(performance.now() - start);
  const healthy = Object.values(details).every(Boolean);
  
  logger.info('Health check completed', { healthy, latency, details });
  
  return { healthy, latency, details };
}
