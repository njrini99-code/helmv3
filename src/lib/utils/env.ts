/**
 * Environment Utilities
 * Safe helpers for checking environment variables
 */

/**
 * Get the application URL (public)
 */
export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}
