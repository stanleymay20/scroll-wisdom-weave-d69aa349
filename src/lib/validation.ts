/**
 * Enterprise-grade input validation library
 * Provides sanitization, validation, and XSS prevention utilities
 */

import { z } from 'zod';

// ============= Constants =============
export const VALIDATION_LIMITS = {
  TITLE_MAX: 200,
  DESCRIPTION_MAX: 2000,
  CONTENT_MAX: 100000,
  EMAIL_MAX: 255,
  NAME_MAX: 100,
  URL_MAX: 2048,
  ID_MAX: 36, // UUID length
  MESSAGE_MAX: 5000,
  SEARCH_MAX: 200,
} as const;

// ============= Sanitization =============

/**
 * Sanitize string input - removes potential XSS vectors
 */
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') return '';
  
  return input
    .trim()
    // Remove null bytes
    .replace(/\0/g, '')
    // Encode HTML entities
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Sanitize for display (less aggressive, for UI rendering)
 */
export function sanitizeForDisplay(input: string): string {
  if (typeof input !== 'string') return '';
  return input.trim().replace(/\0/g, '');
}

/**
 * Sanitize URL - validates and encodes
 */
export function sanitizeUrl(url: string): string | null {
  if (typeof url !== 'string') return null;
  
  try {
    const parsed = new URL(url.trim());
    // Only allow http/https protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

/**
 * Sanitize UUID - validates format
 */
export function sanitizeUUID(id: string): string | null {
  if (typeof id !== 'string') return null;
  
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const trimmed = id.trim();
  
  return uuidRegex.test(trimmed) ? trimmed : null;
}

/**
 * Sanitize email - normalizes and validates
 */
export function sanitizeEmail(email: string): string {
  if (typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

// ============= Zod Schemas =============

/**
 * Email validation schema
 */
export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Email is required')
  .max(VALIDATION_LIMITS.EMAIL_MAX, `Email must be less than ${VALIDATION_LIMITS.EMAIL_MAX} characters`)
  .email('Invalid email address')
  .transform((val) => val.toLowerCase());

/**
 * Password validation schema
 */
export const passwordSchema = z
  .string()
  .min(6, 'Password must be at least 6 characters')
  .max(128, 'Password must be less than 128 characters');

/**
 * Strong password schema (for high-security operations)
 */
export const strongPasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be less than 128 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

/**
 * Name validation schema
 */
export const nameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(VALIDATION_LIMITS.NAME_MAX, `Name must be less than ${VALIDATION_LIMITS.NAME_MAX} characters`)
  .transform(sanitizeForDisplay);

/**
 * Title validation schema
 */
export const titleSchema = z
  .string()
  .trim()
  .min(1, 'Title is required')
  .max(VALIDATION_LIMITS.TITLE_MAX, `Title must be less than ${VALIDATION_LIMITS.TITLE_MAX} characters`)
  .transform(sanitizeForDisplay);

/**
 * Description validation schema
 */
export const descriptionSchema = z
  .string()
  .trim()
  .max(VALIDATION_LIMITS.DESCRIPTION_MAX, `Description must be less than ${VALIDATION_LIMITS.DESCRIPTION_MAX} characters`)
  .transform(sanitizeForDisplay)
  .optional();

/**
 * UUID validation schema
 */
export const uuidSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, 'Invalid ID format');

/**
 * URL validation schema
 */
export const urlSchema = z
  .string()
  .trim()
  .max(VALIDATION_LIMITS.URL_MAX, 'URL is too long')
  .url('Invalid URL')
  .refine((url) => {
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  }, 'URL must use http or https protocol');

/**
 * Search query validation schema
 */
export const searchQuerySchema = z
  .string()
  .trim()
  .max(VALIDATION_LIMITS.SEARCH_MAX, `Search query must be less than ${VALIDATION_LIMITS.SEARCH_MAX} characters`)
  .transform(sanitizeForDisplay);

/**
 * Contact form validation schema
 */
export const contactFormSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  subject: z
    .string()
    .trim()
    .min(1, 'Subject is required')
    .max(200, 'Subject must be less than 200 characters'),
  message: z
    .string()
    .trim()
    .min(10, 'Message must be at least 10 characters')
    .max(VALIDATION_LIMITS.MESSAGE_MAX, `Message must be less than ${VALIDATION_LIMITS.MESSAGE_MAX} characters`),
});

/**
 * Book generation form validation schema
 */
export const bookGenerationSchema = z.object({
  title: titleSchema,
  description: descriptionSchema,
  category: z.string().min(1, 'Category is required'),
  numChapters: z.number().int().min(1).max(50),
  wordCount: z.number().int().min(500).max(10000),
  language: z.string().min(2).max(5),
});

// ============= Validation Helpers =============

/**
 * Validate and parse with Zod schema, returning typed result
 */
export function validateInput<T>(
  schema: z.ZodType<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: string[] } {
  const result = schema.safeParse(data);
  
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  return {
    success: false,
    errors: result.error.errors.map((e) => e.message),
  };
}

/**
 * Check if value is a safe integer within bounds
 */
export function isSafeInteger(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

/**
 * Encode value for URL parameter
 */
export function encodeUrlParam(value: string): string {
  return encodeURIComponent(value);
}

/**
 * Rate limiting helper - tracks attempts per key
 */
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

export function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number
): { allowed: boolean; remainingAttempts: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  
  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
    return { allowed: true, remainingAttempts: maxAttempts - 1 };
  }
  
  if (entry.count >= maxAttempts) {
    return { allowed: false, remainingAttempts: 0 };
  }
  
  entry.count++;
  return { allowed: true, remainingAttempts: maxAttempts - entry.count };
}

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap.entries()) {
    if (now > entry.resetTime) {
      rateLimitMap.delete(key);
    }
  }
}, 60000); // Clean up every minute
