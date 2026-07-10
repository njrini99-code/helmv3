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
import { logSignup, logLogin, logSecurityEvent } from '@/lib/admin-logger';
import { logServerError } from '@/lib/server-error-logger';
import { getAppBaseUrl } from '@/lib/app-base-url';
import { DEMO_ENTER_EVENT } from '@/lib/demo/config';
import { isDemoCoachEmail } from '@/lib/demo/config.server';
import { captureServer } from '@/lib/analytics/posthog-server';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { isSuperAdminUserId } from '@/lib/admin/super-admin-shared';
import { resolveAdminPostLoginPath } from '@/lib/golf/admin-redirect';

export type LoginResult = {
  success: boolean;
  error?: string;
  redirectTo?: string;
};

// Demo account email — configure via DEMO_ACCOUNT_EMAIL env var.
// Never hardcode credentials; the value is checked server-side only.
const DEMO_ACCOUNT_EMAIL =
  (process.env.DEMO_ACCOUNT_EMAIL ?? 'demo@golfhelmdemo.com').toLowerCase().trim();

/**
 * Sanitize a demo ref param: trim, cap at 80 chars, strip control characters.
 */
function sanitizeRef(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, 80);
  return cleaned || undefined;
}

/**
 * Golf-specific login with rate limiting and account lockout protection
 */
async function loginActionImpl(
  email: string,
  password: string,
  ref?: string
): Promise<LoginResult> {
  const normalizedEmail = email.toLowerCase().trim();

  const headersList = await headers();
  const ip = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || 'unknown';
  const userAgent = headersList.get('user-agent') || 'unknown';
  const country = headersList.get('x-vercel-ip-country') ?? undefined;
  const city = headersList.get('x-vercel-ip-city') ?? undefined;

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

  const ipRateLimit = await checkRateLimit(`login:ip:${ip}`, RATE_LIMITS.LOGIN);

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

    // Log failed login attempt (fire-and-forget)
    logSecurityEvent(
      `Failed login attempt: ${normalizedEmail}`,
      lockoutResult.locked ? 'warning' : 'info',
      { email: normalizedEmail, ip, remainingAttempts: lockoutResult.remainingAttempts }
    ).catch(() => {});

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

  // Successful login - reset tracking. Best-effort: resetting the failed-
  // attempt counter must never break a successful login. resetLoginAttempts
  // uses the service-role admin client, which throws when SUPABASE_SERVICE_ROLE_KEY
  // is absent (CI / preview); swallow so auth still succeeds (worst case the
  // counter is left to expire naturally).
  resetRateLimit(`login:email:${normalizedEmail}`);
  resetRateLimit(`login:ip:${ip}`);
  await resetLoginAttempts(normalizedEmail).catch(() => {});

  // Log successful login event (fire-and-forget)
  // Capture demo-login tracing metadata server-side (is_demo is never trusted from client)
  const is_demo = normalizedEmail === DEMO_ACCOUNT_EMAIL;
  logLogin(data.user.id, normalizedEmail, {
    ip,
    userAgent,
    ref: sanitizeRef(ref),
    country,
    city,
    is_demo,
  }).catch(() => {});

  // Trace demo coach logins server-side (fire-and-forget; never throws)
  if (isDemoCoachEmail(normalizedEmail)) {
    captureServer(DEMO_ENTER_EVENT, data.user.id, { ip }).catch(() => {});
  }

  // Helm Bridge — land super-admins on /admin with NO extra DB cost. The
  // allowlist check is a pure env-var parse + Set lookup (same one middleware
  // and requireSuperAdmin already use), so ordinary players/coaches pay
  // nothing extra here. This MUST run before the coach/player onboarding
  // resolution below: a super-admin account can be team-less (no
  // golf_coaches/golf_players row), which would otherwise route it into
  // onboarding instead of the admin console. A caller-supplied returnTo still
  // wins over this default — the client only falls back to `redirectTo` when
  // no returnTo is present (see golf-sign-in-form.tsx).
  if (isSuperAdminUserId(data.user.id, process.env.SUPER_ADMIN_USER_IDS)) {
    return {
      success: true,
      redirectTo: '/admin',
    };
  }

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

  let redirectTo = '/golf/dashboard';

  // Admin users go straight to the admin command center
  if (userData?.role === 'admin') {
    return {
      success: true,
      redirectTo: resolveAdminPostLoginPath(true),
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

const observedLoginAction = withAdminObserved(
  'loginAction',
  { sport: 'golf', feature: 'auth_onboarding' },
  loginActionImpl,
);

export async function loginAction(
  email: string,
  password: string,
  ref?: string
): Promise<LoginResult> {
  return observedLoginAction(email, password, ref);
}

export type SignupResult = {
  success: boolean;
  error?: string;
  redirectTo?: string;
};

/**
 * Golf-specific signup with rate limiting
 */
async function signupActionImpl(
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
  const rateLimit = await checkRateLimit(`signup:ip:${ip}`, RATE_LIMITS.SIGNUP);

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
      emailRedirectTo: `${getAppBaseUrl()}/golf/dashboard`,
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

    // Handle weak / leaked password — Supabase GoTrue rejects passwords that
    // fail its strength policy or appear in the HIBP breach corpus. This is
    // expected user-facing validation, NOT a system fault, so surface the
    // reason directly WITHOUT paging Sentry/admin (matching the rate-limit and
    // duplicate-email branches above). Previously these fell through to the
    // generic logServerError below and surfaced as escalating Sentry
    // "[Golf Auth Error]" issues that drowned out real signup failures.
    if (
      error.message.toLowerCase().includes('weak') ||
      error.message.toLowerCase().includes('easy to guess')
    ) {
      return {
        success: false,
        error: 'Please choose a stronger password — this one is too common or has appeared in a data breach.',
      };
    }

    // Log unknown errors and return generic message
    await logServerError(`[Golf Auth Error]: ${error instanceof Error ? error.message : String(error)}`, { action: 'auth.signupAction' });
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

  // If no session returned, Supabase may not have auto-confirmed the user.
  // Email confirmation should be DISABLED in Supabase dashboard settings.
  // If we get here without a session, something is misconfigured.
  if (!data.session) {
    return {
      success: false,
      error: 'Account created but session could not be established. Please try signing in.',
    };
  }

  // Log signup event (fire-and-forget)
  logSignup(data.user.id, normalizedEmail, role, { ip }).catch(() => {});

  // Auth state changed (session established) — revalidate dashboard like loginAction
  // so server components re-read the new authenticated session.
  revalidatePath('/golf/dashboard');

  // Redirect based on role - coaches go to coach onboarding, players go to player onboarding
  const redirectTo = role === 'coach'
    ? '/golf/coach'
    : '/golf/player';

  return {
    success: true,
    redirectTo,
  };
}

const observedSignupAction = withAdminObserved(
  'signupAction',
  { sport: 'golf', feature: 'auth_onboarding' },
  signupActionImpl,
);

export async function signupAction(
  email: string,
  password: string,
  role: 'player' | 'coach',
  firstName?: string,
  lastName?: string
): Promise<SignupResult> {
  return observedSignupAction(email, password, role, firstName, lastName);
}

export type PasswordResetResult = {
  success: boolean;
  error?: string;
  message?: string;
};

/**
 * Password reset request with rate limiting (shared logic)
 */
async function requestPasswordResetActionImpl(
  email: string
): Promise<PasswordResetResult> {
  const normalizedEmail = email.toLowerCase().trim();

  // Check rate limit
  const rateLimit = await checkRateLimit(
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
    redirectTo: `${getAppBaseUrl()}/golf/reset-password`,
  });

  // Log password-reset request (fire-and-forget) — closes the golf auth
  // capture gap: logins/failed-logins/signups were already tracked, but
  // reset requests were invisible to the admin auth feed.
  logSecurityEvent('Password reset requested', 'info', { email: normalizedEmail, sport: 'golf' }).catch(() => {});

  // Generic response - don't reveal if email exists
  return {
    success: true,
    message: 'If an account exists with this email, a password reset link will be sent.',
  };
}

const observedRequestPasswordResetAction = withAdminObserved(
  'requestPasswordResetAction',
  { sport: 'golf', feature: 'auth_onboarding' },
  requestPasswordResetActionImpl,
);

export async function requestPasswordResetAction(
  email: string
): Promise<PasswordResetResult> {
  return observedRequestPasswordResetAction(email);
}
