/**
 * Enhanced API utilities with automatic diagnostics integration
 */

import { supabase } from "@/integrations/supabase/client";
import { diagnostics } from "@/lib/autoDiagnostics";

interface InvokeOptions {
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
}

/**
 * Invoke a Supabase edge function with automatic error capture and retry
 */
export async function invokeWithDiagnostics<T = unknown>(
  functionName: string,
  options?: InvokeOptions
): Promise<{ data: T | null; error: Error | null }> {
  const retryFn = async () => {
    await supabase.functions.invoke<T>(functionName, options);
  };

  try {
    const { data, error } = await supabase.functions.invoke<T>(functionName, options);
    
    if (error) {
      // Capture the error with auto-retry capability for transient failures
      const isRetryable = error.message?.includes('429') || 
                          error.message?.includes('502') ||
                          error.message?.includes('503') ||
                          error.message?.includes('timeout');
      
      diagnostics.captureError(error.message || 'Function invocation failed', {
        type: functionName.includes('export') ? 'export' : 
              functionName.includes('generate') ? 'generation' : 'network',
        details: { functionName, ...options?.body },
        canAutoRetry: isRetryable,
        retryFn: isRetryable ? retryFn : undefined,
      });
      
      return { data: null, error };
    }
    
    return { data, error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    
    diagnostics.captureError(error, {
      type: 'network',
      details: { functionName },
    });
    
    return { data: null, error };
  }
}

/**
 * Wrapper for fetch with diagnostics
 */
export async function fetchWithDiagnostics(
  url: string,
  options?: RequestInit
): Promise<Response> {
  try {
    const response = await fetch(url, options);
    
    if (!response.ok) {
      const retryFn = response.status === 429 || response.status >= 500
        ? async () => { await fetch(url, options); }
        : undefined;
      
      diagnostics.captureNetworkError(url, response.status, retryFn);
    }
    
    return response;
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    diagnostics.captureError(error, {
      type: 'network',
      details: { url },
    });
    throw error;
  }
}
