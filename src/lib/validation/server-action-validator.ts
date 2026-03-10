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
 * Server action error wrapper
 */
class ServerActionError extends Error {
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
type SecurityEventType =
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

