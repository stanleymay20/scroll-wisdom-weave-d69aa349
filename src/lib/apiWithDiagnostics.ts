/**
 * Enhanced API utilities with unified error notifications
 */

import { supabase } from "@/integrations/supabase/client";
import { notifyError, notifySuccess } from "@/lib/errorNotifier";
import { createLogger } from "@/lib/logger";

const logger = createLogger('ApiWithNotify');

interface InvokeOptions {
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
}

interface NotifyInvokeOptions extends InvokeOptions {
  /** Custom error title */
  errorTitle?: string;
  /** Custom success message (if set, shows success toast) */
  successMessage?: string;
  /** Suppress error toast */
  silent?: boolean;
  /** Retry callback */
  retry?: () => void;
}

/**
 * Invoke a Supabase edge function with automatic error notifications
 */
export async function invokeWithDiagnostics<T = unknown>(
  functionName: string,
  options?: NotifyInvokeOptions
): Promise<{ data: T | null; error: Error | null }> {
  try {
    const { data, error } = await supabase.functions.invoke<T>(functionName, {
      body: options?.body,
      headers: options?.headers,
    });
    
    if (error) {
      logger.error(`${functionName} failed`, { error: error.message });
      
      if (!options?.silent) {
        notifyError(error, {
          title: options?.errorTitle,
          retry: options?.retry,
          context: { functionName },
        });
      }
      
      return { data: null, error };
    }
    
    if (options?.successMessage) {
      notifySuccess(options.successMessage);
    }
    
    return { data, error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error(`${functionName} exception`, { error: error.message });
    
    if (!options?.silent) {
      notifyError(error, {
        title: options?.errorTitle,
        retry: options?.retry,
        context: { functionName },
      });
    }
    
    return { data: null, error };
  }
}

/**
 * Wrapper for fetch with error notifications
 */
export async function fetchWithDiagnostics(
  url: string,
  options?: RequestInit & { silent?: boolean }
): Promise<Response> {
  try {
    const response = await fetch(url, options);
    
    if (!response.ok && !options?.silent) {
      notifyError(new Error(`HTTP ${response.status}: ${response.statusText}`), {
        context: { url, status: response.status },
        retry: () => fetchWithDiagnostics(url, options),
      });
    }
    
    return response;
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    if (!options?.silent) {
      notifyError(error, {
        context: { url },
      });
    }
    throw error;
  }
}
