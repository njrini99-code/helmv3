/**
 * Account Lockout Tracking
 *
 * Persistent tracking of failed login attempts using Supabase.
 * Locks accounts after 10 consecutive failed attempts.
 */

import { createClient } from '@/lib/supabase/server';

const MAX_FAILED_ATTEMPTS = 10;
const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes

export type LoginAttemptResult = {
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
  const supabase = await createClient();
  const normalizedEmail = email.toLowerCase().trim();

  // Get current attempts
  const { data: existing, error: fetchError } = await supabase
    .from('login_attempts')
    .select('*')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (fetchError) {
    console.error('Error fetching login attempts:', fetchError);
    // Fail open - allow login attempt if database error
    return {
      locked: false,
      attempts: 0,
      remainingAttempts: MAX_FAILED_ATTEMPTS,
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
        attempts: existing.failed_attempts,
        lockedUntil: new Date(existing.locked_until),
        remainingAttempts: 0,
      };
    }

    // Reset if last attempt was over 30 minutes ago
    const lastAttempt = new Date(existing.last_attempt);
    const timeSinceLastAttempt = now.getTime() - lastAttempt.getTime();

    if (timeSinceLastAttempt > LOCKOUT_DURATION_MS) {
      attempts = 1; // Reset counter
    } else {
      attempts = existing.failed_attempts + 1;
    }

    // Lock account if max attempts exceeded
    if (attempts >= MAX_FAILED_ATTEMPTS) {
      lockedUntil = new Date(now.getTime() + LOCKOUT_DURATION_MS);
    }

    // Update existing record
    const { error: updateError } = await supabase
      .from('login_attempts')
      .update({
        failed_attempts: attempts,
        last_attempt: now.toISOString(),
        last_ip: ip,
        last_user_agent: userAgent,
        locked_until: lockedUntil?.toISOString() || null,
      })
      .eq('email', normalizedEmail);

    if (updateError) {
      console.error('Error updating login attempts:', updateError);
    }
  } else {
    // Create new record
    const { error: insertError } = await supabase
      .from('login_attempts')
      .insert({
        email: normalizedEmail,
        failed_attempts: attempts,
        last_attempt: now.toISOString(),
        last_ip: ip,
        last_user_agent: userAgent,
        locked_until: null,
      });

    if (insertError) {
      console.error('Error inserting login attempt:', insertError);
    }
  }

  const locked = !!lockedUntil;

  // Log security event if account locked
  if (locked) {
    console.warn('[Security] Account locked due to failed attempts:', {
      email: normalizedEmail,
      attempts,
      ip,
      lockedUntil,
    });
  }

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
  const supabase = await createClient();
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
      attempts: data.failed_attempts,
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

  return {
    locked: false,
    attempts: data.failed_attempts,
    remainingAttempts: Math.max(0, MAX_FAILED_ATTEMPTS - data.failed_attempts),
  };
}

/**
 * Reset login attempts after successful login
 *
 * @param email - User's email
 */
export async function resetLoginAttempts(email: string): Promise<void> {
  const supabase = await createClient();
  const normalizedEmail = email.toLowerCase().trim();

  const { error } = await supabase
    .from('login_attempts')
    .delete()
    .eq('email', normalizedEmail);

  if (error) {
    console.error('Error resetting login attempts:', error);
  }
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
