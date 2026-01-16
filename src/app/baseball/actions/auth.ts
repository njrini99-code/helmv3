'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import {
  checkRateLimit,
  resetRateLimit,
  RATE_LIMITS,
  formatTimeRemaining,
} from '@/lib/auth/rate-limit';
import {
  recordFailedLogin,
  checkAccountLockout,
  resetLoginAttempts,
  formatLockoutMessage,
} from '@/lib/auth/account-lockout';
import { validatePassword } from '@/lib/auth/password-validation';

export type LoginResult = {
  success: boolean;
  error?: string;
  redirectTo?: string;
};

/**
 * Server-side login with rate limiting and account lockout protection
 *
 * Security measures:
 * - Rate limiting: 5 attempts per minute per email
 * - Account lockout: After 10 failed attempts, 30 minute lockout
 * - IP-based rate limiting
 * - Security event logging
 */
export async function loginAction(
  email: string,
  password: string
): Promise<LoginResult> {
  // Normalize email
  const normalizedEmail = email.toLowerCase().trim();

  // Get client IP for rate limiting and logging
  const headersList = await headers();
  const ip = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || 'unknown';
  const userAgent = headersList.get('user-agent') || 'unknown';

  // Check account lockout FIRST (database-persisted)
  const lockoutStatus = await checkAccountLockout(normalizedEmail);
  if (lockoutStatus.locked && lockoutStatus.lockedUntil) {
    console.warn('[Security] Login attempt on locked account:', {
      email: normalizedEmail,
      ip,
      lockedUntil: lockoutStatus.lockedUntil,
    });

    return {
      success: false,
      error: formatLockoutMessage(lockoutStatus.lockedUntil),
    };
  }

  // Check rate limit (in-memory, faster)
  const emailRateLimit = checkRateLimit(
    `login:email:${normalizedEmail}`,
    RATE_LIMITS.LOGIN
  );

  if (!emailRateLimit.allowed) {
    const remaining = formatTimeRemaining(emailRateLimit.resetAt - Date.now());

    console.warn('[Security] Rate limit exceeded for login:', {
      email: normalizedEmail,
      ip,
      resetAt: new Date(emailRateLimit.resetAt),
    });

    return {
      success: false,
      error: `Too many login attempts. Please try again in ${remaining}.`,
    };
  }

  // Also rate limit by IP to prevent distributed attacks
  const ipRateLimit = checkRateLimit(`login:ip:${ip}`, RATE_LIMITS.LOGIN);

  if (!ipRateLimit.allowed) {
    const remaining = formatTimeRemaining(ipRateLimit.resetAt - Date.now());

    console.warn('[Security] Rate limit exceeded for IP:', {
      ip,
      resetAt: new Date(ipRateLimit.resetAt),
    });

    return {
      success: false,
      error: `Too many login attempts from this location. Please try again in ${remaining}.`,
    };
  }

  // Attempt login
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });

  if (error) {
    // Record failed attempt (database-persisted for lockout)
    const lockoutResult = await recordFailedLogin(normalizedEmail, ip, userAgent);

    // Log security event
    console.warn('[Security] Failed login attempt:', {
      email: normalizedEmail,
      ip,
      attempts: lockoutResult.attempts,
      remainingAttempts: lockoutResult.remainingAttempts,
      locked: lockoutResult.locked,
    });

    // Return appropriate error message
    if (lockoutResult.locked && lockoutResult.lockedUntil) {
      return {
        success: false,
        error: formatLockoutMessage(lockoutResult.lockedUntil),
      };
    }

    // Generic error message to prevent email enumeration
    const attemptsWarning =
      lockoutResult.remainingAttempts <= 3 && lockoutResult.remainingAttempts > 0
        ? ` (${lockoutResult.remainingAttempts} attempts remaining)`
        : '';

    return {
      success: false,
      error: `Invalid email or password${attemptsWarning}`,
    };
  }

  // Successful login - reset both rate limits and lockout tracking
  resetRateLimit(`login:email:${normalizedEmail}`);
  resetRateLimit(`login:ip:${ip}`);
  await resetLoginAttempts(normalizedEmail);

  // Log successful login
  console.info('[Auth] Successful login:', {
    email: normalizedEmail,
    userId: data.user.id,
    ip,
  });

  // Get user role and onboarding status to determine redirect
  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', data.user.id)
    .single();

  // For LOGIN (not signup), always redirect to dashboard
  // Onboarding is handled separately and is optional for existing users
  // The dashboard will show a banner to complete onboarding if needed
  const adminAllowlist = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  let redirectTo = '/baseball/dashboard';

  // Check admin allowlist (note: user_role enum only has 'coach' | 'player', no 'admin')
  if (adminAllowlist.includes(normalizedEmail)) {
    return {
      success: true,
      redirectTo: '/admin/command-center',
    };
  }

  // Check if user has a profile record and if onboarding is complete
  if (userData?.role === 'coach') {
    const { data: coachData, error: coachError } = await supabase
      .from('baseball_coaches')
      .select('id, onboarding_completed')
      .eq('user_id', data.user.id)
      .single();

    if (coachError && coachError.code === 'PGRST116') {
      // No record found - need onboarding
      redirectTo = '/baseball/coach-onboarding';
    } else if (coachData && !coachData.onboarding_completed) {
      // Profile exists but onboarding not complete - redirect to finish it
      redirectTo = '/baseball/coach-onboarding';
    }
  } else if (userData?.role === 'player') {
    const { data: playerData, error: playerError } = await supabase
      .from('baseball_players')
      .select('id, onboarding_completed')
      .eq('user_id', data.user.id)
      .single();

    if (playerError && playerError.code === 'PGRST116') {
      // No record found - need onboarding
      redirectTo = '/baseball/player';
    } else if (playerData && !playerData.onboarding_completed) {
      // Profile exists but onboarding not complete - redirect to finish it
      redirectTo = '/baseball/player';
    }
  }

  revalidatePath('/baseball/dashboard');

  return {
    success: true,
    redirectTo,
  };
}

export type SignupResult = {
  success: boolean;
  error?: string;
  redirectTo?: string;
};

/**
 * Server-side signup with rate limiting
 *
 * Security measures:
 * - Rate limiting: 10 signups per hour per IP
 * - Email validation and normalization
 * - Security event logging
 */
export async function signupAction(
  email: string,
  password: string,
  role: 'player' | 'coach'
): Promise<SignupResult> {
  // Normalize email
  const normalizedEmail = email.toLowerCase().trim();

  // Validate password strength FIRST (before rate limiting to provide immediate feedback)
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    return {
      success: false,
      error: passwordValidation.feedback[0] || 'Password does not meet security requirements',
    };
  }

  // Get client IP for rate limiting
  const headersList = await headers();
  const ip = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || 'unknown';

  // Check rate limit (prevent signup spam)
  const rateLimit = checkRateLimit(`signup:ip:${ip}`, RATE_LIMITS.SIGNUP);

  if (!rateLimit.allowed) {
    const remaining = formatTimeRemaining(rateLimit.resetAt - Date.now());

    console.warn('[Security] Signup rate limit exceeded:', {
      ip,
      resetAt: new Date(rateLimit.resetAt),
    });

    return {
      success: false,
      error: `Too many signup attempts. Please try again in ${remaining}.`,
    };
  }

  // Attempt signup
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
    options: {
      data: {
        role,
        sport: 'baseball',  // IMPORTANT: Tells trigger to create baseball-only records
      },
    },
  });

  if (error) {
    console.error('[Auth] Signup error:', {
      email: normalizedEmail,
      error: error.message,
      ip,
    });

    // Handle Supabase rate limiting with user-friendly message
    if (error.message.includes('security purposes') || error.message.includes('rate limit')) {
      // Extract seconds from error message like "...after 57 seconds"
      const match = error.message.match(/after (\d+) seconds/);
      const seconds = match ? match[1] : '60';
      return {
        success: false,
        error: `Please wait ${seconds} seconds before trying again.`,
      };
    }

    // Handle duplicate email
    if (error.message.includes('already registered') || error.message.includes('already exists')) {
      return {
        success: false,
        error: 'An account with this email already exists. Please sign in instead.',
      };
    }

    return {
      success: false,
      error: error.message,
    };
  }

  if (!data.user) {
    return {
      success: false,
      error: 'Failed to create account',
    };
  }

  // Log successful signup
  console.info('[Auth] Successful signup:', {
    email: normalizedEmail,
    userId: data.user.id,
    role,
    ip,
  });

  // Redirect based on role - coaches go to onboarding, players go to player onboarding
  const redirectTo = role === 'coach'
    ? '/baseball/coach-onboarding'
    : '/baseball/player';

  return {
    success: true,
    redirectTo,
  };
}

export type PasswordResetResult = {
  success: boolean;
  error?: string;
  message?: string;
};

/**
 * Server-side password reset request with rate limiting
 *
 * Security measures:
 * - Rate limiting: 3 requests per hour per email
 * - Generic response to prevent email enumeration
 * - Security event logging
 */
export async function requestPasswordResetAction(
  email: string
): Promise<PasswordResetResult> {
  const normalizedEmail = email.toLowerCase().trim();

  // Get client IP for logging
  const headersList = await headers();
  const ip = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || 'unknown';

  // Check rate limit (prevent password reset spam/DoS)
  const rateLimit = checkRateLimit(
    `password-reset:email:${normalizedEmail}`,
    RATE_LIMITS.PASSWORD_RESET
  );

  if (!rateLimit.allowed) {
    console.warn('[Security] Password reset rate limit exceeded:', {
      email: normalizedEmail,
      ip,
      resetAt: new Date(rateLimit.resetAt),
    });

    // Return generic message to prevent email enumeration
    return {
      success: true,
      message: 'If an account exists with this email, a password reset link will be sent.',
    };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/baseball/reset-password`,
  });

  if (error) {
    console.error('[Auth] Password reset error:', {
      email: normalizedEmail,
      error: error.message,
      ip,
    });

    // Return generic message even on error to prevent email enumeration
    return {
      success: true,
      message: 'If an account exists with this email, a password reset link will be sent.',
    };
  }

  console.info('[Auth] Password reset requested:', {
    email: normalizedEmail,
    ip,
  });

  // Generic response - don't reveal if email exists
  return {
    success: true,
    message: 'If an account exists with this email, a password reset link will be sent.',
  };
}
