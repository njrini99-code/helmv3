/**
 * Server Action Input Validation & Sanitization
 *
 * Provides comprehensive validation for all server actions to prevent:
 * - SQL injection
 * - XSS attacks
 * - Command injection
 * - Path traversal
 * - Mass assignment vulnerabilities
 */

import { z } from 'zod';

/**
 * Common validation schemas
 */
export const CommonSchemas = {
  // String validations
  email: z.string().email().max(255).toLowerCase().trim(),

  name: z.string()
    .min(1, 'Name is required')
    .max(200, 'Name must be less than 200 characters')
    .regex(/^[a-zA-Z0-9\s\-'.]+$/, 'Name contains invalid characters')
    .trim(),

  shortText: z.string()
    .max(500, 'Text must be less than 500 characters')
    .trim(),

  longText: z.string()
    .max(5000, 'Text must be less than 5000 characters')
    .trim(),

  url: z.string()
    .url('Invalid URL')
    .max(500, 'URL must be less than 500 characters')
    .refine(
      (url) => {
        try {
          const parsed = new URL(url);
          // Only allow http(s) protocols
          return parsed.protocol === 'http:' || parsed.protocol === 'https:';
        } catch {
          return false;
        }
      },
      'URL must use HTTP or HTTPS protocol'
    ),

  // UUID validation
  uuid: z.string().uuid('Invalid ID format'),

  // Number validations
  positiveInt: z.number().int().positive(),
  nonNegativeInt: z.number().int().nonnegative(),

  // Date validations
  futureDate: z.string().refine(
    (date) => new Date(date) > new Date(),
    'Date must be in the future'
  ),

  pastDate: z.string().refine(
    (date) => new Date(date) < new Date(),
    'Date must be in the past'
  ),

  // Phone number (basic validation)
  phone: z.string()
    .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format')
    .max(20)
    .optional()
    .nullable(),

  // Color hex code
  hexColor: z.string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid color format (must be #RRGGBB)')
    .optional()
    .nullable(),
};

/**
 * Sanitize HTML to prevent XSS
 */
export function sanitizeHtml(input: string): string {
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Sanitize SQL input (for search queries, not for parameterized queries)
 */
export function sanitizeSqlLike(input: string): string {
  return input
    .replace(/[_%\\]/g, '\\$&')
    .trim();
}

/**
 * Validate and sanitize file path to prevent path traversal
 */
export function validateFilePath(path: string): { valid: boolean; sanitized: string } {
  // Remove any path traversal attempts
  const sanitized = path
    .replace(/\.\./g, '')
    .replace(/\/\//g, '/')
    .replace(/^\//, '');

  // Check for suspicious patterns (intentionally detecting control characters for security)
  // eslint-disable-next-line no-control-regex
  const suspicious = /[<>:"|?*\x00-\x1f]/.test(sanitized);

  return {
    valid: !suspicious && sanitized === path.replace(/^\//, ''),
    sanitized,
  };
}

/**
 * Rate limit key generator for mutations
 */
export function getMutationRateLimitKey(
  action: string,
  userId: string,
  resource?: string
): string {
  if (resource) {
    return `mutation:${action}:${userId}:${resource}`;
  }
  return `mutation:${action}:${userId}`;
}

/**
 * Validate object keys to prevent mass assignment
 */
export function validateAllowedKeys<T extends Record<string, unknown>>(
  data: Record<string, unknown>,
  allowedKeys: (keyof T)[]
): T {
  const filtered: Record<string, unknown> = {};

  for (const key of allowedKeys) {
    if (key in data) {
      filtered[key as string] = data[key as string];
    }
  }

  return filtered as T;
}

/**
 * Validate array length
 */
export function validateArrayLength<T>(
  arr: T[],
  min: number,
  max: number,
  fieldName: string = 'Array'
): { valid: boolean; error?: string } {
  if (arr.length < min) {
    return { valid: false, error: `${fieldName} must have at least ${min} items` };
  }
  if (arr.length > max) {
    return { valid: false, error: `${fieldName} must have at most ${max} items` };
  }
  return { valid: true };
}

/**
 * Server action error wrapper
 */
export class ServerActionError extends Error {
  constructor(
    message: string,
    public code: 'VALIDATION' | 'UNAUTHORIZED' | 'NOT_FOUND' | 'RATE_LIMIT' | 'SERVER_ERROR',
    public details?: unknown
  ) {
    super(message);
    this.name = 'ServerActionError';
  }
}

/**
 * Security event types
 */
export type SecurityEventType =
  | 'validation_failed'
  | 'unauthorized_access'
  | 'rate_limit_exceeded'
  | 'suspicious_activity'
  | 'organization_update'
  | 'watchlist_update'
  | 'watchlist_note_add'
  | 'message_sent'
  | 'team_join_attempt'
  | string; // Allow custom event types

/**
 * Safe error response formatter
 * Prevents leaking sensitive information in error messages
 */
export function formatSafeErrorResponse(error: unknown): {
  success: false;
  error: string;
} {
  if (error instanceof ServerActionError) {
    // Custom errors are safe to return
    return {
      success: false,
      error: error.message,
    };
  }

  if (error instanceof z.ZodError) {
    // Return first validation error
    const firstError = error.issues?.[0];
    return {
      success: false,
      error: firstError?.message || 'Invalid input data',
    };
  }

  // For unknown errors, return generic message and log details
  console.error('[Server Action] Unexpected error:', error);

  return {
    success: false,
    error: 'An unexpected error occurred. Please try again.',
  };
}

/**
 * Log security event
 */
export async function logSecurityEvent(details: {
  event: SecurityEventType;
  userId?: string;
  ip?: string;
  metadata?: Record<string, unknown>;
  action?: string;
}): Promise<void> {
  console.warn(`[Security Event] ${details.event}:`, {
    timestamp: new Date().toISOString(),
    ...details,
  });

  // Could extend this to write to a security_events table in the future
}

/**
 * Validation decorator for server actions
 *
 * Example:
 * ```ts
 * const schema = z.object({ name: z.string(), age: z.number() });
 * const validated = await validateInput(schema, rawInput);
 * ```
 */
export async function validateInput<T extends z.ZodType>(
  schema: T,
  input: unknown
): Promise<z.infer<T>> {
  try {
    return await schema.parseAsync(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      await logSecurityEvent({
        event: 'validation_failed',
        action: 'input_validation',
        metadata: { errors: error.issues },
      });
    }
    throw error;
  }
}
