/**
 * Account Lockout Tracking
 *
 * Persistent tracking of failed login attempts using Supabase.
 * Locks accounts after 10 consecutive failed attempts.
 */

import { createAdminClient } from '@/lib/supabase/admin';

const MAX_FAILED_ATTEMPTS = 10;
const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes

type LoginAttemptResult = {
  locked: boolean;
  attempts: number;
  lockedUntil?: Date;
  remainingAttempts: number;
};

/**
 * Record a failed login attempt
 *
 * @param email - User's email
 * @param ip - IP address of request
 * @param userAgent - User agent string
 * @returns LoginAttemptResult with lockout status
 */
export async function recordFailedLogin(
  email: string,
  ip: string | null,
  userAgent: string | null
): Promise<LoginAttemptResult> {
  const supabase = createAdminClient();
  const normalizedEmail = email.toLowerCase().trim();

  // Get current attempts
  const { data: existing, error: fetchError } = await supabase
    .from('login_attempts')
    .select('*')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (fetchError) {
    // Fail closed on query errors to prevent brute-force during DB issues.
    // Only fail open for connection-level errors (e.g., network unreachable).
    const isConnectionError = fetchError.message?.includes('fetch') ||
      fetchError.message?.includes('network') ||
      fetchError.message?.includes('ECONNREFUSED');

    if (isConnectionError) {
      // Fail open for connectivity issues to avoid DoS via DB outage
      return {
        locked: false,
        attempts: 0,
        remainingAttempts: MAX_FAILED_ATTEMPTS,
      };
    }

    // Fail closed for query-level errors (safer default)
    return {
      locked: true,
      attempts: MAX_FAILED_ATTEMPTS,
      remainingAttempts: 0,
    };
  }

  const now = new Date();
  let attempts = 1;
  let lockedUntil: Date | undefined;

  if (existing) {
    // Check if currently locked
    if (existing.locked_until && new Date(existing.locked_until) > now) {
      return {
        locked: true,
        attempts: existing.failed_attempts ?? 0,
        lockedUntil: new Date(existing.locked_until),
        remainingAttempts: 0,
      };
    }

    // Reset if last attempt was over 30 minutes ago
    const lastAttempt = existing.last_attempt ? new Date(existing.last_attempt) : new Date(0);
    const timeSinceLastAttempt = now.getTime() - lastAttempt.getTime();

    if (timeSinceLastAttempt > LOCKOUT_DURATION_MS) {
      attempts = 1; // Reset counter
    } else {
      attempts = (existing.failed_attempts ?? 0) + 1;
    }

    // Lock account if max attempts exceeded
    if (attempts >= MAX_FAILED_ATTEMPTS) {
      lockedUntil = new Date(now.getTime() + LOCKOUT_DURATION_MS);
    }

    // Update existing record
    await supabase
      .from('login_attempts')
      .update({
        failed_attempts: attempts,
        last_attempt: now.toISOString(),
        last_ip: ip,
        last_user_agent: userAgent,
        locked_until: lockedUntil?.toISOString() || null,
      })
      .eq('email', normalizedEmail);
  } else {
    // Create new record
    await supabase
      .from('login_attempts')
      .insert({
        email: normalizedEmail,
        failed_attempts: attempts,
        last_attempt: now.toISOString(),
        last_ip: ip,
        last_user_agent: userAgent,
        locked_until: null,
      });
  }

  const locked = !!lockedUntil;

  return {
    locked,
    attempts,
    lockedUntil,
    remainingAttempts: Math.max(0, MAX_FAILED_ATTEMPTS - attempts),
  };
}

/**
 * Check if account is currently locked
 *
 * @param email - User's email
 * @returns LoginAttemptResult with current status
 */
export async function checkAccountLockout(
  email: string
): Promise<LoginAttemptResult> {
  const supabase = createAdminClient();
  const normalizedEmail = email.toLowerCase().trim();

  const { data, error } = await supabase
    .from('login_attempts')
    .select('*')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (error || !data) {
    return {
      locked: false,
      attempts: 0,
      remainingAttempts: MAX_FAILED_ATTEMPTS,
    };
  }

  const now = new Date();
  const lockedUntil = data.locked_until ? new Date(data.locked_until) : undefined;

  // Check if lock has expired
  if (lockedUntil && lockedUntil > now) {
    return {
      locked: true,
      attempts: data.failed_attempts ?? 0,
      lockedUntil,
      remainingAttempts: 0,
    };
  }

  // Lock expired, reset attempts
  if (lockedUntil && lockedUntil <= now) {
    await resetLoginAttempts(normalizedEmail);
    return {
      locked: false,
      attempts: 0,
      remainingAttempts: MAX_FAILED_ATTEMPTS,
    };
  }

  const currentAttempts = data.failed_attempts ?? 0;
  return {
    locked: false,
    attempts: currentAttempts,
    remainingAttempts: Math.max(0, MAX_FAILED_ATTEMPTS - currentAttempts),
  };
}

/**
 * Reset login attempts after successful login
 *
 * @param email - User's email
 */
export async function resetLoginAttempts(email: string): Promise<void> {
  const supabase = createAdminClient();
  const normalizedEmail = email.toLowerCase().trim();

  await supabase
    .from('login_attempts')
    .delete()
    .eq('email', normalizedEmail);
}

/**
 * Format lockout message for user
 */
export function formatLockoutMessage(lockedUntil: Date): string {
  const now = new Date();
  const remainingMs = lockedUntil.getTime() - now.getTime();

  if (remainingMs <= 0) {
    return 'Your account lockout has expired. You may try again.';
  }

  const minutes = Math.ceil(remainingMs / 60000);

  if (minutes === 1) {
    return 'Account locked. Please try again in 1 minute.';
  }

  if (minutes < 60) {
    return `Account locked. Please try again in ${minutes} minutes.`;
  }

  const hours = Math.ceil(minutes / 60);
  return `Account locked. Please try again in ${hours} hour${hours === 1 ? '' : 's'}.`;
}
