'use server';

import { createClient } from '@/lib/supabase/server';
import {
  checkRateLimit,
  resetRateLimit,
  RATE_LIMITS,
  formatTimeRemaining,
} from '@/lib/auth/supabase-rate-limit';
import {
  recordFailedLogin,
  checkAccountLockout,
  resetLoginAttempts,
  formatLockoutMessage,
} from '@/lib/auth/account-lockout';
import { validatePassword } from '@/lib/auth/password-validation';
import { logServerError } from '@/lib/server-error-logger';

export type LoginResult = {
  success: boolean;
  error?: string;
  redirectTo?: string;
};

export type SignupResult = {
  success: boolean;
  error?: string;
};

/**
 * Lifting Lab sign-in — reuses the shared Supabase auth.users pool.
 * On success, returns redirectTo='/lifting/dashboard'.
 */
export async function liftingLoginAction(
  email: string,
  password: string
): Promise<LoginResult> {
  const normalizedEmail = email.toLowerCase().trim();

  // Account lockout guard
  const lockoutStatus = await checkAccountLockout(normalizedEmail);
  if (lockoutStatus.locked && lockoutStatus.lockedUntil) {
    return { success: false, error: formatLockoutMessage(lockoutStatus.lockedUntil) };
  }

  // Rate limit guard (per-email)
  const emailRateLimit = await checkRateLimit(
    `login:email:${normalizedEmail}`,
    RATE_LIMITS.LOGIN
  );
  if (!emailRateLimit.allowed) {
    const remaining = formatTimeRemaining(emailRateLimit.resetAt - Date.now());
    return {
      success: false,
      error: `Too many login attempts. Please try again in ${remaining}.`,
    };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (error || !data.user) {
      // recordFailedLogin(email, ip, userAgent) — pass nulls since we don't
      // have headers() in scope without the import; the email-level guard suffices.
      await recordFailedLogin(normalizedEmail, null, null);
      return { success: false, error: error?.message ?? 'Invalid credentials.' };
    }

    await resetLoginAttempts(normalizedEmail);
    await resetRateLimit(`login:email:${normalizedEmail}`);

    return { success: true, redirectTo: '/lifting/dashboard' };
  } catch (err) {
    await logServerError(
      'Lifting Lab login: unexpected error',
      {
        action: 'liftingLoginAction',
        featureArea: 'lifting-auth',
        source: 'server_action',
        handled: false,
        tags: { sport: 'lifting' },
      },
      'error'
    );
    const msg = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return { success: false, error: msg };
  }
}

/**
 * Lifting Lab sign-up — creates a role='coach' account with sport:'lifting' metadata.
 */
export async function liftingSignupAction(
  email: string,
  password: string,
  fullName: string
): Promise<SignupResult> {
  const normalizedEmail = email.toLowerCase().trim();

  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    const firstFeedback = passwordValidation.feedback[0];
    return {
      success: false,
      error: firstFeedback ?? 'Password does not meet the requirements.',
    };
  }

  try {
    const supabase = await createClient();
    const origin =
      process.env.NEXT_PUBLIC_APP_URL ??
      process.env.VERCEL_URL ??
      'http://localhost:3000';

    const { error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo: `${origin}/lifting/login?message=account_created`,
        data: {
          full_name: fullName,
          sport: 'lifting',
          role: 'coach',
        },
      },
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    await logServerError(
      'Lifting Lab signup: unexpected error',
      {
        action: 'liftingSignupAction',
        featureArea: 'lifting-auth',
        source: 'server_action',
        handled: false,
        tags: { sport: 'lifting' },
      },
      'error'
    );
    const msg = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return { success: false, error: msg };
  }
}
