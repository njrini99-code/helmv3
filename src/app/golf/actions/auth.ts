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
    // Security: Account is locked due to too many failed attempts
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

    // Security: Failed login attempt recorded
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

  // Get user role and profile status to determine redirect
  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', data.user.id)
    .maybeSingle();

  const [coachResult, playerResult] = await Promise.all([
    supabase
      .from('golf_coaches')
      .select('id, onboarding_completed')
      .eq('user_id', data.user.id)
      .maybeSingle(),
    supabase
      .from('golf_players')
      .select('id, onboarding_completed')
      .eq('user_id', data.user.id)
      .maybeSingle(),
  ]);

  const coachProfile = coachResult.data;
  const playerProfile = playerResult.data;

  // Default to dashboard, but redirect to onboarding if profile is missing/incomplete
  const adminAllowlist = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  let redirectTo = '/golf/dashboard';

  // Note: user_role enum only has 'coach' | 'player', not 'admin'
  // Admin access is determined by email allowlist only
  if (adminAllowlist.includes(normalizedEmail)) {
    return {
      success: true,
      redirectTo: '/admin/command-center',
    };
  }

  // Resolve role using profile presence to avoid misrouting
  const declaredRole = (userData?.role === 'coach' || userData?.role === 'player')
    ? userData.role
    : null;
  const resolvedRole = coachProfile && playerProfile
    ? (declaredRole || 'coach')
    : coachProfile
      ? 'coach'
      : playerProfile
        ? 'player'
        : declaredRole;

  if (resolvedRole === 'coach') {
    if (!coachProfile || !coachProfile.onboarding_completed) {
      redirectTo = '/golf/coach';
    }
  } else if (resolvedRole === 'player') {
    if (!playerProfile || !playerProfile.onboarding_completed) {
      redirectTo = '/golf/player';
    }
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
  role: 'player' | 'coach',
  firstName?: string,
  lastName?: string
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
        first_name: firstName || '',
        last_name: lastName || '',
      },
      // Skip email confirmation redirect - user will be auto-confirmed if disabled in Supabase
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/golf/dashboard`,
    },
  });

  if (error) {
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

    // Log unknown errors and return generic message
    console.error('[Golf Auth Error]', error);
    return {
      success: false,
      error: 'Failed to create account. Please try again.',
    };
  }

  if (!data.user) {
    return {
      success: false,
      error: 'Failed to create account',
    };
  }

  // Note: If no session is returned, email confirmation might be enabled in Supabase.
  // To disable: Supabase Dashboard > Authentication > Providers > Email > Confirm email = OFF
  if (!data.session) {
    console.warn('[Golf Auth] No session after signup - email confirmation may be enabled. Disable in Supabase Dashboard > Authentication > Providers > Email');
  }

  // Redirect based on role - coaches go to coach onboarding, players go to player onboarding
  const redirectTo = role === 'coach'
    ? '/golf/coach'
    : '/golf/player';

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

  await supabase.auth.resetPasswordForEmail(normalizedEmail, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/golf/reset-password`,
  });

  // Generic response - don't reveal if email exists
  return {
    success: true,
    message: 'If an account exists with this email, a password reset link will be sent.',
  };
}
