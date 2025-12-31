/**
 * Environment Utilities
 * Safe helpers for checking environment variables
 */

/**
 * Check if the application is in development mode
 * SECURITY: Never trusts client-side env in production
 * @returns {boolean} True only if both conditions are met:
 *   1. NODE_ENV is 'development'
 *   2. NEXT_PUBLIC_DEV_MODE is explicitly 'true'
 */
export function isDevMode(): boolean {
  // Production check first - never allow dev mode in production
  if (process.env.NODE_ENV === 'production') {
    return false;
  }

  // In development, check explicit flag
  return process.env.NEXT_PUBLIC_DEV_MODE === 'true';
}

/**
 * Check if the application is in production
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Get the application URL (public)
 */
export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}

/**
 * Get the application name (public)
 */
export function getAppName(): string {
  return process.env.NEXT_PUBLIC_APP_NAME || 'Helm Sports Labs';
}
