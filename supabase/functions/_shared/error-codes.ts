/**
 * EDGE FUNCTION ERROR TAXONOMY
 * Shared error codes for all Supabase Edge Functions.
 * Mirror of src/lib/errorCodes.ts for server-side use.
 */

export const ErrorCode = {
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  AUTH_EXPIRED: 'AUTH_EXPIRED',
  AUTH_INVALID: 'AUTH_INVALID',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  DAILY_LIMIT_REACHED: 'DAILY_LIMIT_REACHED',
  MONTHLY_LIMIT_REACHED: 'MONTHLY_LIMIT_REACHED',
  PLAN_UPGRADE_REQUIRED: 'PLAN_UPGRADE_REQUIRED',
  AI_CREDITS_EXHAUSTED: 'AI_CREDITS_EXHAUSTED',
  GENERATION_FAILED: 'GENERATION_FAILED',
  GENERATION_TIMEOUT: 'GENERATION_TIMEOUT',
  GENERATION_PARTIAL: 'GENERATION_PARTIAL',
  GENERATION_CONTENT_FILTER: 'GENERATION_CONTENT_FILTER',
  GENERATION_INVALID_INPUT: 'GENERATION_INVALID_INPUT',
  NETWORK_ERROR: 'NETWORK_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  RATE_LIMITED: 'RATE_LIMITED',
  TIMEOUT: 'TIMEOUT',
  NOT_FOUND: 'NOT_FOUND',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  EXPORT_FAILED: 'EXPORT_FAILED',
  UNKNOWN: 'UNKNOWN',
} as const;

export type ErrorCodeType = typeof ErrorCode[keyof typeof ErrorCode];

const STATUS_MAP: Record<string, number> = {
  AUTH_REQUIRED: 401, AUTH_EXPIRED: 401, AUTH_INVALID: 401,
  QUOTA_EXCEEDED: 429, DAILY_LIMIT_REACHED: 429, MONTHLY_LIMIT_REACHED: 429,
  PLAN_UPGRADE_REQUIRED: 403, AI_CREDITS_EXHAUSTED: 402,
  GENERATION_FAILED: 500, GENERATION_TIMEOUT: 504, GENERATION_PARTIAL: 206,
  GENERATION_CONTENT_FILTER: 422, GENERATION_INVALID_INPUT: 400,
  RATE_LIMITED: 429, TIMEOUT: 504, SERVICE_UNAVAILABLE: 503,
  NOT_FOUND: 404, PERMISSION_DENIED: 403, VALIDATION_ERROR: 400,
  EXPORT_FAILED: 500, UNKNOWN: 500,
};

const RETRYABLE = new Set([
  'GENERATION_FAILED', 'GENERATION_TIMEOUT', 'GENERATION_PARTIAL',
  'NETWORK_ERROR', 'SERVICE_UNAVAILABLE', 'RATE_LIMITED', 'TIMEOUT',
  'EXPORT_FAILED', 'UNKNOWN',
]);

/**
 * Create a structured error Response for edge functions
 */
export function errorResponse(
  code: ErrorCodeType,
  message: string,
  corsHeaders: Record<string, string>,
  details?: Record<string, unknown>
): Response {
  return new Response(
    JSON.stringify({
      error: {
        code,
        message,
        retryable: RETRYABLE.has(code),
        details,
      },
    }),
    {
      status: STATUS_MAP[code] || 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Simple in-memory rate limiter for edge functions
 * Note: Resets on cold start. For production, use Redis/DB.
 */
const rateLimitStore = new Map<string, { count: number; windowStart: number }>();

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now - entry.windowStart > windowMs) {
    rateLimitStore.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (entry.count >= maxRequests) {
    const retryAfterMs = windowMs - (now - entry.windowStart);
    return { allowed: false, retryAfterMs };
  }

  entry.count++;
  return { allowed: true };
}
