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

  // Debug: Log successful login
  console.log('[Golf Login] Successful login for user:', {
    id: data.user.id,
    email: data.user.email,
    sessionExists: !!data.session
  });

  // CRITICAL: Verify the session is properly established before profile queries
  // This ensures auth.uid() in RLS policies returns the correct value
  const { data: sessionCheck } = await supabase.auth.getUser();
  console.log('[Golf Login] Session verification:', {
    sessionUserId: sessionCheck?.user?.id,
    expectedUserId: data.user.id,
    match: sessionCheck?.user?.id === data.user.id
  });

  // If session isn't established yet, create a fresh client with the session token
  // This handles cases where the cookie hasn't propagated within the same request
  let queryClient = supabase;
  if (!sessionCheck?.user || sessionCheck.user.id !== data.user.id) {
    console.log('[Golf Login] Session mismatch - using access token directly');
    // Create a new client with the session token
    const { createClient: createFreshClient } = await import('@supabase/supabase-js');
    queryClient = createFreshClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${data.session?.access_token}`,
          },
        },
      }
    );
  }

  // Get user role and profile status to determine redirect
  const { data: userData } = await queryClient
    .from('users')
    .select('role')
    .eq('id', data.user.id)
    .maybeSingle();

  const [coachResult, playerResult] = await Promise.all([
    queryClient
      .from('golf_coaches')
      .select('id, onboarding_completed')
      .eq('user_id', data.user.id)
      .maybeSingle(),
    queryClient
      .from('golf_players')
      .select('id, onboarding_completed')
      .eq('user_id', data.user.id)
      .maybeSingle(),
  ]);

  // Debug: Check for RLS/query errors that maybeSingle() might hide
  if (coachResult.error) {
    console.error('[Golf Login] Error fetching coach profile:', coachResult.error);
  }
  if (playerResult.error) {
    console.error('[Golf Login] Error fetching player profile:', playerResult.error);
  }

  const coachProfile = coachResult.data;
  const playerProfile = playerResult.data;

  // Debug: Log what we found
  console.log('[Golf Login] Profile lookup results:', {
    userId: data.user.id,
    coachProfile: coachProfile ? { id: coachProfile.id, onboarding: coachProfile.onboarding_completed } : null,
    playerProfile: playerProfile ? { id: playerProfile.id, onboarding: playerProfile.onboarding_completed } : null,
  });

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

  // Debug: Log final redirect decision
  console.log('[Golf Login] Redirect decision:', {
    declaredRole,
    resolvedRole,
    hasCoachProfile: !!coachProfile,
    coachOnboarded: coachProfile?.onboarding_completed,
    hasPlayerProfile: !!playerProfile,
    playerOnboarded: playerProfile?.onboarding_completed,
    redirectTo,
  });

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

  // If no session is returned, email confirmation might be enabled in Supabase.
  // We handle this by immediately signing in the user after signup to create a session.
  // This bypasses email confirmation at the application level while still creating the account.
  if (!data.session) {
    // Auto-sign in the user immediately after signup to bypass email confirmation
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (signInError) {
      // If sign-in fails due to email confirmation requirement, the user was created
      // but Supabase is blocking login. We need to handle this gracefully.
      // Check if it's specifically an email confirmation error
      if (signInError.message.includes('Email not confirmed') ||
          signInError.message.includes('email_not_confirmed')) {
        // The user account exists but email confirmation is required by Supabase
        // Return success anyway - the user record is created, they just need to confirm
        // OR the Supabase admin should disable email confirmation
        return {
          success: false,
          error: 'Account created but email confirmation is required. Please check your email or contact support.',
        };
      }

      // For other sign-in errors, log and return generic error
      console.error('[Golf Auth] Auto sign-in after signup failed:', signInError);
      return {
        success: false,
        error: 'Account created but automatic sign-in failed. Please try signing in manually.',
      };
    }

    // Successfully signed in after signup
    if (!signInData.session) {
      return {
        success: false,
        error: 'Account created but session could not be established. Please try signing in.',
      };
    }
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
