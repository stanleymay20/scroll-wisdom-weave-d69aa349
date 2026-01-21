/**
 * CLIENT-SIDE RATE LIMITING
 * 
 * Provides client-side rate limiting to prevent abuse.
 * Server-side rate limiting is also enforced via edge functions.
 */

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

// In-memory rate limit tracking (per session)
const rateLimitMap = new Map<string, RateLimitEntry>();

// Default configurations for different endpoints
export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  'generate-book': { maxRequests: 5, windowMs: 60000 }, // 5 per minute
  'generate-chapter': { maxRequests: 10, windowMs: 60000 }, // 10 per minute
  'generate-cover': { maxRequests: 5, windowMs: 60000 }, // 5 per minute
  'export-book': { maxRequests: 3, windowMs: 60000 }, // 3 per minute
  'text-to-speech': { maxRequests: 20, windowMs: 60000 }, // 20 per minute
  'contact-form': { maxRequests: 3, windowMs: 300000 }, // 3 per 5 minutes
  'certificate-verify': { maxRequests: 30, windowMs: 60000 }, // 30 per minute
  default: { maxRequests: 60, windowMs: 60000 }, // 60 per minute default
};

/**
 * Check if a request should be rate limited
 * Returns true if the request is allowed, false if rate limited
 */
export function checkRateLimit(endpoint: string): boolean {
  const config = RATE_LIMITS[endpoint] || RATE_LIMITS.default;
  const now = Date.now();
  const key = endpoint;
  
  const entry = rateLimitMap.get(key);
  
  if (!entry || now - entry.windowStart > config.windowMs) {
    // New window
    rateLimitMap.set(key, { count: 1, windowStart: now });
    return true;
  }
  
  if (entry.count >= config.maxRequests) {
    return false;
  }
  
  entry.count++;
  return true;
}

/**
 * Get remaining requests for an endpoint
 */
export function getRemainingRequests(endpoint: string): number {
  const config = RATE_LIMITS[endpoint] || RATE_LIMITS.default;
  const now = Date.now();
  const key = endpoint;
  
  const entry = rateLimitMap.get(key);
  
  if (!entry || now - entry.windowStart > config.windowMs) {
    return config.maxRequests;
  }
  
  return Math.max(0, config.maxRequests - entry.count);
}

/**
 * Get time until rate limit resets (in ms)
 */
export function getResetTime(endpoint: string): number {
  const config = RATE_LIMITS[endpoint] || RATE_LIMITS.default;
  const now = Date.now();
  const key = endpoint;
  
  const entry = rateLimitMap.get(key);
  
  if (!entry) {
    return 0;
  }
  
  const elapsed = now - entry.windowStart;
  return Math.max(0, config.windowMs - elapsed);
}

/**
 * Rate limit error class
 */
export class RateLimitError extends Error {
  public readonly endpoint: string;
  public readonly resetTime: number;
  
  constructor(endpoint: string, resetTime: number) {
    super(`Rate limit exceeded for ${endpoint}. Try again in ${Math.ceil(resetTime / 1000)}s.`);
    this.name = 'RateLimitError';
    this.endpoint = endpoint;
    this.resetTime = resetTime;
  }
}

/**
 * Wrapper that enforces rate limiting
 * Throws RateLimitError if limit exceeded
 */
export function withRateLimit<T>(
  endpoint: string,
  fn: () => Promise<T>
): Promise<T> {
  if (!checkRateLimit(endpoint)) {
    const resetTime = getResetTime(endpoint);
    throw new RateLimitError(endpoint, resetTime);
  }
  return fn();
}
