/**
 * db-error.ts — Safe database error handling for server actions
 *
 * Maps raw Supabase / PostgreSQL errors to user-friendly messages
 * and logs internal details server-side only.
 */

interface SupabaseLikeError {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
}

/**
 * Sanitize a raw database/auth error for display to the end user.
 * Logs the real error server-side with `context` for debugging.
 *
 * @param err   The raw error object (unknown shape)
 * @param context A short label for server logs, e.g. 'createGame'
 * @param fallback Optional custom fallback message
 */
export function sanitizeDbError(
  err: unknown,
  context: string,
  fallback = 'Something went wrong. Please try again.'
): string {
  // Always log the real error server-side
  console.error(`[DB Error:${context}]`, err);

  const msg =
    (err as SupabaseLikeError)?.message?.toLowerCase() ?? '';
  const code = (err as SupabaseLikeError)?.code ?? '';

  // Auth errors — keep these somewhat informative since they guide the user
  if (msg.includes('invalid login credentials') || msg.includes('invalid credentials')) {
    return 'Incorrect email or password.';
  }
  if (msg.includes('email not confirmed')) {
    return 'Please verify your email address before signing in.';
  }
  if (msg.includes('user already registered') || msg.includes('already exists')) {
    return 'An account with this email already exists.';
  }
  if (msg.includes('email rate limit') || msg.includes('too many requests') || code === '429') {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  if (msg.includes('weak password') || msg.includes('password should be')) {
    return 'Password does not meet the security requirements.';
  }

  // RLS / permission errors — never expose policy names
  if (
    msg.includes('row-level security') ||
    msg.includes('rls') ||
    msg.includes('permission denied') ||
    code === '42501'
  ) {
    return 'You do not have permission to perform this action.';
  }

  // Constraint violations
  if (msg.includes('unique constraint') || msg.includes('duplicate key') || code === '23505') {
    return 'A record with this information already exists.';
  }
  if (msg.includes('foreign key') || code === '23503') {
    return 'Related record not found. Please refresh and try again.';
  }
  if (msg.includes('not-null') || msg.includes('not null') || code === '23502') {
    return 'Required information is missing. Please check all fields.';
  }

  // Network / timeout
  if (msg.includes('timeout') || msg.includes('fetch failed') || msg.includes('econnrefused')) {
    return 'Connection timed out. Please check your connection and try again.';
  }

  return fallback;
}

/**
 * Sanitize an auth-specific error (Supabase Auth API responses).
 * More context-aware than the general DB sanitizer.
 */
export function sanitizeAuthError(err: unknown, context: string): string {
  console.error(`[Auth Error:${context}]`, err);

  const msg = (err as SupabaseLikeError)?.message?.toLowerCase() ?? '';

  if (
    context === 'changePassword' &&
    (msg.includes('invalid login credentials') || msg.includes('invalid credentials'))
  ) {
    return 'Current password is incorrect.';
  }
  if (msg.includes('password') && (msg.includes('character') || msg.includes('length') || msg.includes('weak'))) {
    return 'Password must be at least 8 characters.';
  }
  if (msg.includes('session') && msg.includes('miss')) {
    return 'Your session has expired. Please sign in again.';
  }
  if (msg.includes('same password')) {
    return 'New password must be different from your current password.';
  }
  if (msg.includes('invalid login credentials') || msg.includes('invalid credentials')) {
    return context === 'updatePassword'
      ? 'Current password is incorrect.'
      : 'Invalid email or password.';
  }
  if (msg.includes('rate limit') || msg.includes('too many')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }

  return 'Unable to complete this action. Please try again.';
}
