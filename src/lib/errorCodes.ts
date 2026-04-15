/**
 * ENTERPRISE ERROR TAXONOMY
 * 
 * Structured error codes for all ScrollLibrary operations.
 * Every edge function and client-side error maps to this taxonomy.
 */

// ============= Error Code Enum =============

export const ErrorCode = {
  // Auth errors (1xx)
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  AUTH_EXPIRED: 'AUTH_EXPIRED',
  AUTH_INVALID: 'AUTH_INVALID',
  
  // Quota & billing errors (2xx)
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  DAILY_LIMIT_REACHED: 'DAILY_LIMIT_REACHED',
  MONTHLY_LIMIT_REACHED: 'MONTHLY_LIMIT_REACHED',
  PLAN_UPGRADE_REQUIRED: 'PLAN_UPGRADE_REQUIRED',
  AI_CREDITS_EXHAUSTED: 'AI_CREDITS_EXHAUSTED',
  
  // Generation errors (3xx)
  GENERATION_FAILED: 'GENERATION_FAILED',
  GENERATION_TIMEOUT: 'GENERATION_TIMEOUT',
  GENERATION_PARTIAL: 'GENERATION_PARTIAL',
  GENERATION_CONTENT_FILTER: 'GENERATION_CONTENT_FILTER',
  GENERATION_INVALID_INPUT: 'GENERATION_INVALID_INPUT',
  
  // Network & infrastructure (4xx)
  NETWORK_ERROR: 'NETWORK_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  RATE_LIMITED: 'RATE_LIMITED',
  TIMEOUT: 'TIMEOUT',
  
  // Data errors (5xx)
  NOT_FOUND: 'NOT_FOUND',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  CONFLICT: 'CONFLICT',
  
  // Export errors (6xx)
  EXPORT_FAILED: 'EXPORT_FAILED',
  EXPORT_TOO_LARGE: 'EXPORT_TOO_LARGE',
  
  // Unknown
  UNKNOWN: 'UNKNOWN',
} as const;

export type ErrorCodeType = typeof ErrorCode[keyof typeof ErrorCode];

// ============= Structured Error =============

export interface StructuredError {
  code: ErrorCodeType;
  message: string;
  userMessage: string;
  retryable: boolean;
  details?: Record<string, unknown>;
  retryAfterMs?: number;
}

// ============= Error Metadata =============

interface ErrorMeta {
  userMessage: string;
  retryable: boolean;
  httpStatus: number;
}

const ERROR_META: Record<ErrorCodeType, ErrorMeta> = {
  // Auth
  AUTH_REQUIRED: { userMessage: 'Please sign in to continue.', retryable: false, httpStatus: 401 },
  AUTH_EXPIRED: { userMessage: 'Your session has expired. Please sign in again.', retryable: false, httpStatus: 401 },
  AUTH_INVALID: { userMessage: 'Authentication failed. Please try signing in again.', retryable: false, httpStatus: 401 },
  
  // Quota
  QUOTA_EXCEEDED: { userMessage: 'You\'ve reached your usage limit. Upgrade your plan for more.', retryable: false, httpStatus: 429 },
  DAILY_LIMIT_REACHED: { userMessage: 'You\'ve reached your daily limit. Try again tomorrow.', retryable: false, httpStatus: 429 },
  MONTHLY_LIMIT_REACHED: { userMessage: 'You\'ve reached your monthly limit. Upgrade for more.', retryable: false, httpStatus: 429 },
  PLAN_UPGRADE_REQUIRED: { userMessage: 'This feature requires a higher plan.', retryable: false, httpStatus: 403 },
  AI_CREDITS_EXHAUSTED: { userMessage: 'AI credits exhausted. Please try again later or upgrade.', retryable: false, httpStatus: 402 },
  
  // Generation
  GENERATION_FAILED: { userMessage: 'Content generation failed. Please try again.', retryable: true, httpStatus: 500 },
  GENERATION_TIMEOUT: { userMessage: 'Generation took too long. Please try again.', retryable: true, httpStatus: 504 },
  GENERATION_PARTIAL: { userMessage: 'Generation partially completed. You can resume from where it stopped.', retryable: true, httpStatus: 206 },
  GENERATION_CONTENT_FILTER: { userMessage: 'Content was filtered for safety. Please adjust your topic.', retryable: false, httpStatus: 422 },
  GENERATION_INVALID_INPUT: { userMessage: 'Invalid input. Please check your topic and settings.', retryable: false, httpStatus: 400 },
  
  // Network
  NETWORK_ERROR: { userMessage: 'Network error. Please check your connection.', retryable: true, httpStatus: 0 },
  SERVICE_UNAVAILABLE: { userMessage: 'Service is temporarily unavailable. Please try again shortly.', retryable: true, httpStatus: 503 },
  RATE_LIMITED: { userMessage: 'Too many requests. Please wait a moment and try again.', retryable: true, httpStatus: 429 },
  TIMEOUT: { userMessage: 'Request timed out. Please try again.', retryable: true, httpStatus: 504 },
  
  // Data
  NOT_FOUND: { userMessage: 'The requested resource was not found.', retryable: false, httpStatus: 404 },
  PERMISSION_DENIED: { userMessage: 'You don\'t have permission to access this.', retryable: false, httpStatus: 403 },
  VALIDATION_ERROR: { userMessage: 'Invalid data. Please check your input.', retryable: false, httpStatus: 400 },
  CONFLICT: { userMessage: 'A conflict occurred. Please refresh and try again.', retryable: true, httpStatus: 409 },
  
  // Export
  EXPORT_FAILED: { userMessage: 'Export failed. Please try again.', retryable: true, httpStatus: 500 },
  EXPORT_TOO_LARGE: { userMessage: 'Content too large to export. Try exporting fewer chapters.', retryable: false, httpStatus: 413 },
  
  // Unknown
  UNKNOWN: { userMessage: 'An unexpected error occurred. Please try again.', retryable: true, httpStatus: 500 },
};

// ============= Factory Functions =============

/**
 * Create a structured error from a code
 */
export function createError(
  code: ErrorCodeType,
  technicalMessage?: string,
  details?: Record<string, unknown>
): StructuredError {
  const meta = ERROR_META[code] || ERROR_META.UNKNOWN;
  return {
    code,
    message: technicalMessage || meta.userMessage,
    userMessage: meta.userMessage,
    retryable: meta.retryable,
    details,
  };
}

/**
 * Get HTTP status for an error code
 */
export function getHttpStatus(code: ErrorCodeType): number {
  return ERROR_META[code]?.httpStatus ?? 500;
}

/**
 * Classify a raw error into a structured error
 */
export function classifyError(error: unknown): StructuredError {
  if (error && typeof error === 'object' && 'code' in error) {
    const e = error as { code?: string; message?: string };
    if (e.code && e.code in ERROR_META) {
      return createError(e.code as ErrorCodeType, e.message);
    }
  }
  
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    
    if (error.name === 'AbortError' || msg.includes('timeout')) {
      return createError(ErrorCode.TIMEOUT, error.message);
    }
    if (msg.includes('fetch') || msg.includes('network') || msg.includes('failed to fetch')) {
      return createError(ErrorCode.NETWORK_ERROR, error.message);
    }
    if (msg.includes('401') || msg.includes('unauthorized')) {
      return createError(ErrorCode.AUTH_EXPIRED, error.message);
    }
    if (msg.includes('402') || msg.includes('payment')) {
      return createError(ErrorCode.AI_CREDITS_EXHAUSTED, error.message);
    }
    if (msg.includes('429') || msg.includes('rate limit')) {
      return createError(ErrorCode.RATE_LIMITED, error.message);
    }
    if (msg.includes('403') || msg.includes('forbidden')) {
      return createError(ErrorCode.PERMISSION_DENIED, error.message);
    }
    if (msg.includes('404') || msg.includes('not found')) {
      return createError(ErrorCode.NOT_FOUND, error.message);
    }
    
    return createError(ErrorCode.UNKNOWN, error.message);
  }
  
  return createError(ErrorCode.UNKNOWN, String(error));
}

/**
 * Check if an error is retryable
 */
export function isRetryable(error: StructuredError): boolean {
  return error.retryable;
}

/**
 * Format error for edge function JSON response
 */
export function errorResponse(code: ErrorCodeType, message?: string, details?: Record<string, unknown>) {
  const meta = ERROR_META[code] || ERROR_META.UNKNOWN;
  return {
    body: JSON.stringify({
      error: {
        code,
        message: message || meta.userMessage,
        retryable: meta.retryable,
        details,
      },
    }),
    status: meta.httpStatus,
  };
}
