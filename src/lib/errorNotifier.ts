/**
 * Unified Error Notification System
 * 
 * Centralizes all error handling and user-facing notifications.
 * Integrates with sonner toast for consistent UX.
 */

import { toast } from 'sonner';
import { createLogger } from '@/lib/logger';

const logger = createLogger('ErrorNotifier');

// ============= Types =============

type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical';
type ErrorCategory = 'network' | 'auth' | 'generation' | 'export' | 'database' | 'validation' | 'unknown';

interface ErrorNotification {
  title: string;
  description?: string;
  severity: ErrorSeverity;
  category: ErrorCategory;
  retryAction?: () => void;
  duration?: number;
}

interface NotifyOptions {
  /** Custom title override */
  title?: string;
  /** Custom description override */
  description?: string;
  /** Function to retry the failed operation */
  retry?: () => void;
  /** Duration in ms (default auto-calculated by severity) */
  duration?: number;
  /** Silently log without showing toast */
  silent?: boolean;
  /** Additional context for logging */
  context?: Record<string, unknown>;
}

// ============= Error Classification =============

function classifyError(error: unknown): { category: ErrorCategory; severity: ErrorSeverity; message: string } {
  const message = error instanceof Error ? error.message : String(error);
  const lowerMsg = message.toLowerCase();

  // Auth errors
  if (lowerMsg.includes('401') || lowerMsg.includes('unauthorized') || lowerMsg.includes('jwt') || lowerMsg.includes('not authenticated')) {
    return { category: 'auth', severity: 'error', message: 'Your session has expired. Please sign in again.' };
  }
  if (lowerMsg.includes('403') || lowerMsg.includes('forbidden') || lowerMsg.includes('permission')) {
    return { category: 'auth', severity: 'error', message: 'You don\'t have permission to do this.' };
  }

  // Rate limiting
  if (lowerMsg.includes('429') || lowerMsg.includes('rate limit') || lowerMsg.includes('too many requests')) {
    return { category: 'network', severity: 'warning', message: 'Too many requests. Please wait a moment and try again.' };
  }

  // Payment / quota
  if (lowerMsg.includes('402') || lowerMsg.includes('payment required') || lowerMsg.includes('quota')) {
    return { category: 'network', severity: 'warning', message: 'Service temporarily unavailable. Please try again shortly.' };
  }

  // Server errors
  if (lowerMsg.includes('500') || lowerMsg.includes('internal server')) {
    return { category: 'network', severity: 'error', message: 'Something went wrong on our end. Please try again.' };
  }
  if (lowerMsg.includes('502') || lowerMsg.includes('503') || lowerMsg.includes('504') || lowerMsg.includes('service unavailable')) {
    return { category: 'network', severity: 'warning', message: 'Service is temporarily unavailable. Retrying...' };
  }

  // Network / connectivity
  if (lowerMsg.includes('network') || lowerMsg.includes('failed to fetch') || lowerMsg.includes('offline') || lowerMsg.includes('connection')) {
    return { category: 'network', severity: 'warning', message: 'Network error. Please check your connection.' };
  }
  if (lowerMsg.includes('timeout') || lowerMsg.includes('timed out') || lowerMsg.includes('aborted')) {
    return { category: 'network', severity: 'warning', message: 'Request timed out. Please try again.' };
  }

  // Generation errors
  if (lowerMsg.includes('generat') || lowerMsg.includes('chapter') || lowerMsg.includes('ai ') || lowerMsg.includes('model')) {
    return { category: 'generation', severity: 'error', message: 'Generation failed. Please try again or simplify your request.' };
  }

  // Export errors
  if (lowerMsg.includes('export') || lowerMsg.includes('pdf') || lowerMsg.includes('epub') || lowerMsg.includes('docx')) {
    return { category: 'export', severity: 'error', message: 'Export failed. Please ensure all chapters are ready and try again.' };
  }

  // Database errors
  if (lowerMsg.includes('duplicate') || lowerMsg.includes('unique') || lowerMsg.includes('constraint')) {
    return { category: 'database', severity: 'warning', message: 'This item already exists.' };
  }
  if (lowerMsg.includes('not found') || lowerMsg.includes('no rows')) {
    return { category: 'database', severity: 'info', message: 'The requested item was not found.' };
  }

  // Validation
  if (lowerMsg.includes('valid') || lowerMsg.includes('required') || lowerMsg.includes('must be') || lowerMsg.includes('invalid')) {
    return { category: 'validation', severity: 'warning', message };
  }

  return { category: 'unknown', severity: 'error', message: message || 'An unexpected error occurred.' };
}

// ============= Notification Display =============

function getToastDuration(severity: ErrorSeverity): number {
  switch (severity) {
    case 'info': return 3000;
    case 'warning': return 5000;
    case 'error': return 6000;
    case 'critical': return 10000;
  }
}

function getCategoryTitle(category: ErrorCategory): string {
  switch (category) {
    case 'network': return 'Connection Issue';
    case 'auth': return 'Authentication Error';
    case 'generation': return 'Generation Failed';
    case 'export': return 'Export Failed';
    case 'database': return 'Data Error';
    case 'validation': return 'Validation Error';
    case 'unknown': return 'Something Went Wrong';
  }
}

function showNotification(notification: ErrorNotification) {
  const { title, description, severity, retryAction, duration } = notification;
  const toastDuration = duration ?? getToastDuration(severity);

  const action = retryAction
    ? { label: 'Retry', onClick: retryAction }
    : undefined;

  switch (severity) {
    case 'info':
      toast.info(title, { description, duration: toastDuration, action });
      break;
    case 'warning':
      toast.warning(title, { description, duration: toastDuration, action });
      break;
    case 'error':
    case 'critical':
      toast.error(title, { description, duration: toastDuration, action });
      break;
  }
}

// ============= Public API =============

/**
 * Notify the user of an error with automatic classification and appropriate toast
 */
export function notifyError(error: unknown, options: NotifyOptions = {}) {
  const classified = classifyError(error);
  
  logger.error('Error notification', {
    category: classified.category,
    severity: classified.severity,
    message: classified.message,
    ...options.context,
  });

  if (options.silent) return;

  showNotification({
    title: options.title ?? getCategoryTitle(classified.category),
    description: options.description ?? classified.message,
    severity: classified.severity,
    category: classified.category,
    retryAction: options.retry,
    duration: options.duration,
  });
}

/**
 * Notify success
 */
export function notifySuccess(title: string, description?: string) {
  toast.success(title, { description, duration: 3000 });
}

/**
 * Wrap an async function with automatic error notification
 */
export async function withErrorNotification<T>(
  fn: () => Promise<T>,
  options: NotifyOptions & { successMessage?: string } = {}
): Promise<T | null> {
  try {
    const result = await fn();
    if (options.successMessage) {
      notifySuccess(options.successMessage);
    }
    return result;
  } catch (error) {
    notifyError(error, { ...options, retry: options.retry ?? (() => withErrorNotification(fn, options)) });
    return null;
  }
}

// ============= Global Error Handlers =============

let _initialized = false;

export function initGlobalErrorHandlers() {
  if (_initialized || typeof window === 'undefined') return;
  _initialized = true;

  // Unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    const message = event.reason?.message || String(event.reason);
    
    // Skip noisy/expected rejections
    if (message.includes('ResizeObserver') || message.includes('Script error')) return;
    
    logger.error('Unhandled rejection', { message });
    
    // Only show toast for user-impacting errors, not internal framework errors
    const classified = classifyError(event.reason);
    if (classified.category === 'auth' || classified.category === 'network') {
      notifyError(event.reason, { silent: false });
    }
  });

  // Global JS errors  
  window.addEventListener('error', (event) => {
    // Skip script loading errors (handled by ErrorBoundary)
    if (event.filename?.includes('chunk') || event.message?.includes('Loading chunk')) return;
    
    logger.error('Global error', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
    });
  });

  logger.info('Global error handlers initialized');
}
