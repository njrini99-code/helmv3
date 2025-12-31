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
 * Golf-specific login with rate limiting and account lockout protection
 */
export async function loginAction(
  email: string,
  password: string
): Promise<LoginResult> {
  const normalizedEmail = email.toLowerCase().trim();

  const headersList = await headers();
  const ip = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || 'unknown';
  const userAgent = headersList.get('user-agent') || 'unknown';

  // Check account lockout
  const lockoutStatus = await checkAccountLockout(normalizedEmail);
  if (lockoutStatus.locked && lockoutStatus.lockedUntil) {
    console.warn('[Security] Golf login attempt on locked account:', {
      email: normalizedEmail,
      ip,
      lockedUntil: lockoutStatus.lockedUntil,
    });

    return {
      success: false,
      error: formatLockoutMessage(lockoutStatus.lockedUntil),
    };
  }

  // Check rate limits
  const emailRateLimit = checkRateLimit(
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

  const ipRateLimit = checkRateLimit(`login:ip:${ip}`, RATE_LIMITS.LOGIN);

  if (!ipRateLimit.allowed) {
    const remaining = formatTimeRemaining(ipRateLimit.resetAt - Date.now());
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
    const lockoutResult = await recordFailedLogin(normalizedEmail, ip, userAgent);

    console.warn('[Security] Failed golf login attempt:', {
      email: normalizedEmail,
      ip,
      attempts: lockoutResult.attempts,
      remainingAttempts: lockoutResult.remainingAttempts,
      locked: lockoutResult.locked,
    });

    if (lockoutResult.locked && lockoutResult.lockedUntil) {
      return {
        success: false,
        error: formatLockoutMessage(lockoutResult.lockedUntil),
      };
    }

    const attemptsWarning =
      lockoutResult.remainingAttempts <= 3 && lockoutResult.remainingAttempts > 0
        ? ` (${lockoutResult.remainingAttempts} attempts remaining)`
        : '';

    return {
      success: false,
      error: `Invalid email or password${attemptsWarning}`,
    };
  }

  // Successful login - reset tracking
  resetRateLimit(`login:email:${normalizedEmail}`);
  resetRateLimit(`login:ip:${ip}`);
  await resetLoginAttempts(normalizedEmail);

  console.info('[Auth] Successful golf login:', {
    email: normalizedEmail,
    userId: data.user.id,
    ip,
  });

  // Get user role for golf
  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', data.user.id)
    .single();

  let redirectTo = '/golf/dashboard';

  if (userData?.role === 'coach') {
    const { data: coachData } = await supabase
      .from('golf_coaches')
      .select('onboarding_completed')
      .eq('user_id', data.user.id)
      .single();

    redirectTo = coachData?.onboarding_completed
      ? '/golf/dashboard'
      : '/golf/coach-onboarding';
  } else if (userData?.role === 'player') {
    const { data: playerData } = await supabase
      .from('golf_players')
      .select('onboarding_completed')
      .eq('user_id', data.user.id)
      .single();

    redirectTo = playerData?.onboarding_completed
      ? '/golf/dashboard'
      : '/golf/player-onboarding';
  }

  revalidatePath('/golf/dashboard');

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
 * Golf-specific signup with rate limiting
 */
export async function signupAction(
  email: string,
  password: string,
  role: 'player' | 'coach'
): Promise<SignupResult> {
  const normalizedEmail = email.toLowerCase().trim();

  // Validate password strength FIRST (before rate limiting to provide immediate feedback)
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    return {
      success: false,
      error: passwordValidation.feedback[0] || 'Password does not meet security requirements',
    };
  }

  const headersList = await headers();
  const ip = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || 'unknown';

  // Check rate limit
  const rateLimit = checkRateLimit(`signup:ip:${ip}`, RATE_LIMITS.SIGNUP);

  if (!rateLimit.allowed) {
    const remaining = formatTimeRemaining(rateLimit.resetAt - Date.now());
    return {
      success: false,
      error: `Too many signup attempts. Please try again in ${remaining}.`,
    };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
    options: {
      data: {
        role,
        sport: 'golf',
      },
    },
  });

  if (error) {
    console.error('[Auth] Golf signup error:', {
      email: normalizedEmail,
      error: error.message,
      ip,
    });

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

  console.info('[Auth] Successful golf signup:', {
    email: normalizedEmail,
    userId: data.user.id,
    role,
    ip,
  });

  const redirectTo =
    role === 'coach' ? '/golf/coach-onboarding' : '/golf/player-onboarding';

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
 * Password reset request with rate limiting (shared logic)
 */
export async function requestPasswordResetAction(
  email: string
): Promise<PasswordResetResult> {
  const normalizedEmail = email.toLowerCase().trim();

  const headersList = await headers();
  const ip = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || 'unknown';

  // Check rate limit
  const rateLimit = checkRateLimit(
    `password-reset:email:${normalizedEmail}`,
    RATE_LIMITS.PASSWORD_RESET
  );

  if (!rateLimit.allowed) {
    // Return generic message to prevent email enumeration
    return {
      success: true,
      message: 'If an account exists with this email, a password reset link will be sent.',
    };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/golf/reset-password`,
  });

  if (error) {
    console.error('[Auth] Golf password reset error:', {
      email: normalizedEmail,
      error: error.message,
      ip,
    });
  } else {
    console.info('[Auth] Golf password reset requested:', {
      email: normalizedEmail,
      ip,
    });
  }

  // Generic response - don't reveal if email exists
  return {
    success: true,
    message: 'If an account exists with this email, a password reset link will be sent.',
  };
}
