'use server';

import { withAdminObserved } from '@/lib/admin/observed-action';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
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
import { sanitizeAuthError } from '@/lib/db-error';
import { logSignup, logLogin, logSecurityEvent } from '@/lib/admin-logger';
import { logServerError } from '@/lib/server-error-logger';
import { getAppBaseUrl } from '@/lib/app-base-url';
import { sendPasswordResetEmail } from '@/lib/auth/send-password-reset';
import { resetSessionIdleMarker } from '@/lib/auth/session-idle-server';
import { signInWithPasswordResilient } from '@/lib/auth/resilient-get-user';
import { describeError } from '@/lib/utils/describe-error';

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
async function loginActionImpl(
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

  // Check rate limit (DB-backed, works across serverless instances)
  const emailRateLimit = await checkRateLimit(
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
  const ipRateLimit = await checkRateLimit(`login:ip:${ip}`, RATE_LIMITS.LOGIN);

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

  const { data, error } = await signInWithPasswordResilient(supabase, {
    email: normalizedEmail,
    password,
  });

  if (error || !data.user) {
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

    // Log failed login attempt (fire-and-forget)
    logSecurityEvent(
      `Failed login attempt: ${normalizedEmail}`,
      lockoutResult.locked ? 'warning' : 'info',
      { email: normalizedEmail, ip, remainingAttempts: lockoutResult.remainingAttempts, sport: 'baseball' }
    ).catch(() => {});

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

  await resetSessionIdleMarker();

  // Successful login - reset both rate limits and lockout tracking
  await Promise.all([
    resetRateLimit(`login:email:${normalizedEmail}`),
    resetRateLimit(`login:ip:${ip}`),
    resetLoginAttempts(normalizedEmail),
  ]);

  // Log successful login
  console.info('[Auth] Successful login:', {
    email: normalizedEmail,
    userId: data.user.id,
    ip,
  });

  // Log successful login event (fire-and-forget)
  logLogin(data.user.id, normalizedEmail, { ip, userAgent, sport: 'baseball' }).catch(() => {});

  // Get user role and profile status to determine redirect
  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', data.user.id)
    .single();

  const [coachResult, playerResult] = await Promise.all([
    supabase
      .from('baseball_coaches')
      .select('id, onboarding_completed, coach_type')
      .eq('user_id', data.user.id)
      .maybeSingle(),
    supabase
      .from('baseball_players')
      .select('id, onboarding_completed, player_type')
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

  let redirectTo = '/baseball/dashboard';

  // Check admin allowlist (note: user_role enum only has 'coach' | 'player', no 'admin')
  if (adminAllowlist.includes(normalizedEmail)) {
    return {
      success: true,
      redirectTo: '/baseball/dashboard/command-center',
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
      redirectTo = '/baseball/coach-onboarding';
    } else {
      redirectTo = '/baseball/dashboard/command-center';
    }
  } else if (resolvedRole === 'player') {
    if (!playerProfile || !playerProfile.onboarding_completed) {
      redirectTo = '/baseball/player';
    } else {
      redirectTo = '/baseball/player/today';
    }
  } else {
    // No role or profile found — send to complete-signup to create a profile
    redirectTo = '/baseball/complete-signup';
  }

  revalidatePath('/baseball');

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
async function signupActionImpl(
  email: string,
  password: string,
  role: 'player' | 'coach',
  firstName?: string,
  lastName?: string
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
  const rateLimit = await checkRateLimit(`signup:ip:${ip}`, RATE_LIMITS.SIGNUP);

  if (!rateLimit.allowed) {
    const remaining = formatTimeRemaining(rateLimit.resetAt - Date.now());

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
        first_name: firstName || '',
        last_name: lastName || '',
      },
    },
  });

  if (error) {
    await logServerError(`[Auth] Signup error: ${error.message}`, {
      action: 'auth.signupAction',
      metadata: { email: normalizedEmail, ip },
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
      error: 'An unexpected error occurred. Please try again.',
    };
  }

  if (!data.user) {
    return {
      success: false,
      error: 'Failed to create account',
    };
  }

  // Code-side backstop: seed baseball_players shell row for players so the
  // onboarding update always finds a row, even when the DB trigger hasn't fired.
  if (role === 'player') {
    try {
      const { error: playerSeedError } = await supabase
        .from('baseball_players')
        .upsert(
          {
            user_id: data.user.id,
            player_type: 'high_school' as const,
            email: normalizedEmail,
            first_name: firstName ?? null,
            last_name: lastName ?? null,
            recruiting_activated: false,
            onboarding_completed: false,
            profile_completion_percent: 0,
          },
          { onConflict: 'user_id', ignoreDuplicates: true },
        );

      if (playerSeedError) {
        // Non-fatal: auth succeeded; log but never surface DB failure to the user.
        await logServerError(
          `[Auth] Failed to seed baseball_players shell row: ${playerSeedError.message}`,
          { action: 'auth.signupAction', metadata: { userId: data.user.id } },
        );
      }
    } catch (seedErr) {
      await logServerError(
        `[Auth] Unexpected error seeding baseball_players: ${describeError(seedErr)}`,
        { action: 'auth.signupAction', metadata: { userId: data.user.id } },
      );
    }
  }

  // Log signup event (fire-and-forget)
  logSignup(data.user.id, normalizedEmail, role, { ip, sport: 'baseball' }).catch(() => {});

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
async function requestPasswordResetActionImpl(
  email: string
): Promise<PasswordResetResult> {
  const normalizedEmail = email.toLowerCase().trim();

  // Get client IP for logging
  const headersList = await headers();
  const ip = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || 'unknown';

  // Check rate limit (prevent password reset spam/DoS)
  const rateLimit = await checkRateLimit(
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

  // Sent through OUR Resend account, not Supabase's built-in mailer.
  //
  // That mailer is rate limited to a couple of messages an hour: on
  // 2026-08-05 two resets ~7 minutes apart produced one logged /recover, one
  // that never reached the auth log at all, and NEITHER email arrived — while
  // the UI said "Check your email" both times. A coach locked out the night
  // their team signs up would have had no way back in, and nothing in the
  // incident queue would have shown a failure.
  //
  // Resend is already the transport for every other email here, on a verified
  // domain, and it writes to public.emails — so a reset that fails to deliver
  // is now visible instead of silent.
  const outcome = await sendPasswordResetEmail(
    normalizedEmail,
    `${getAppBaseUrl()}/baseball/reset-password`,
    'BaseballHelm',
  );
  const error = outcome === 'send-failed' || outcome === 'link-failed' || outcome === 'unconfigured'
    ? { message: `password reset delivery: ${outcome}` }
    : null;

  if (error) {
    await logServerError(`[Auth] Password reset error: ${error.message}`, {
      action: 'auth.requestPasswordResetAction',
      metadata: { email: normalizedEmail, ip },
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

  // Log password-reset request (fire-and-forget) — mirrors golf auth's
  // admin-feed capture so reset requests are visible for both sports.
  logSecurityEvent('Password reset requested', 'info', { email: normalizedEmail, sport: 'baseball' }).catch(() => {});

  // Generic response - don't reveal if email exists
  return {
    success: true,
    message: 'If an account exists with this email, a password reset link will be sent.',
  };
}

export type ChangePasswordResult = {
  success: boolean;
  error?: string;
};

/**
 * Change password for the signed-in user after verifying the current password.
 *
 * Security:
 * - Requires an active session
 * - Re-authenticates via signInWithPassword before updateUser
 * - Rate limited per user id
 * - Auth errors sanitized before returning to the client
 */
async function changePasswordActionImpl(
  currentPassword: string,
  newPassword: string,
): Promise<ChangePasswordResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return { success: false, error: 'Your session has expired. Please sign in again.' };
  }

  if (!currentPassword.trim()) {
    return { success: false, error: 'Current password is required.' };
  }

  if (currentPassword === newPassword) {
    return {
      success: false,
      error: 'New password must be different from your current password.',
    };
  }

  const passwordValidation = validatePassword(newPassword);
  if (!passwordValidation.valid) {
    return {
      success: false,
      error: passwordValidation.feedback[0] || 'Password does not meet security requirements',
    };
  }

  const rateLimit = await checkRateLimit(
    `password-change:user:${user.id}`,
    RATE_LIMITS.PASSWORD_CHANGE,
  );

  if (!rateLimit.allowed) {
    const remaining = formatTimeRemaining(rateLimit.resetAt - Date.now());
    return {
      success: false,
      error: `Too many password change attempts. Please try again in ${remaining}.`,
    };
  }

  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });

  if (verifyError) {
    await logServerError(`[Auth] Password change reauth failed: ${verifyError.message}`, {
      action: 'auth.changePasswordAction',
      metadata: { userId: user.id },
    });
    return {
      success: false,
      error: sanitizeAuthError(verifyError, 'changePassword'),
    };
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (updateError) {
    await logServerError(`[Auth] Password change update failed: ${updateError.message}`, {
      action: 'auth.changePasswordAction',
      metadata: { userId: user.id },
    });
    return {
      success: false,
      error: sanitizeAuthError(updateError, 'changePassword'),
    };
  }

  await resetRateLimit(`password-change:user:${user.id}`);
  revalidatePath('/baseball/dashboard/settings');

  return { success: true };
}

export const loginAction = withAdminObserved(
  'loginAction',
  { sport: 'baseball', feature: 'baseball_auth', featureArea: 'baseball-auth' },
  loginActionImpl,
);

export const signupAction = withAdminObserved(
  'signupAction',
  { sport: 'baseball', feature: 'baseball_auth', featureArea: 'baseball-auth' },
  signupActionImpl,
);

export const requestPasswordResetAction = withAdminObserved(
  'requestPasswordResetAction',
  { sport: 'baseball', feature: 'baseball_auth', featureArea: 'baseball-auth' },
  requestPasswordResetActionImpl,
);

export const changePasswordAction = withAdminObserved(
  'changePasswordAction',
  { sport: 'baseball', feature: 'baseball_auth', featureArea: 'baseball-auth' },
  changePasswordActionImpl,
);
