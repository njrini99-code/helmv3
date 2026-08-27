'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { resolveClientIp } from '@/lib/security/client-ip';
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
import { sendPasswordResetEmail } from '@/lib/auth/send-password-reset';
import { DEMO_ENTER_EVENT } from '@/lib/demo/config';
import { isDemoCoachEmail } from '@/lib/demo/config.server';
import { captureServer } from '@/lib/analytics/posthog-server';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { isSuperAdminUserId } from '@/lib/admin/super-admin-shared';
import { resolveAdminPostLoginPath } from '@/lib/golf/admin-redirect';
import { resetSessionIdleMarker } from '@/lib/auth/session-idle-server';
import { verifyStaffInvite } from '@/lib/golf/staff-invite';
import { joinTeamAsAssistantCoach, redeemStaffInvite } from '@/app/golf/actions/teams';
import { resolveStaffInviteCode } from '@/lib/golf/staff-invite-lookup';
import { signInWithPasswordResilient } from '@/lib/auth/resilient-get-user';
import { describeError } from '@/lib/utils/describe-error';
import { verifySignupGate } from '@/lib/golf/signup-gate';
import { resolveGolfCoachEntry } from '@/lib/golf/coach-entry-path';

export type LoginResult = {
  success: boolean;
  error?: string;
  redirectTo?: string;
};

// Demo account email — configure via DEMO_ACCOUNT_EMAIL env var.
// Never hardcode credentials; the value is checked server-side only.
const DEMO_ACCOUNT_EMAIL =
  (process.env.DEMO_ACCOUNT_EMAIL ?? 'demo@golfhelmdemo.com').toLowerCase().trim();

// Per-(ip, email) password-reset limit — separate from RATE_LIMITS.PASSWORD_RESET
// (which stays a stricter per-email-only bucket shared with baseball's auth
// action). Sized with the same NAT headroom as RATE_LIMITS.DEMO_GATE in
// lib/auth/rate-limit.ts: several teammates behind one campus egress IP must
// each get their own budget, not share a single global counter.
const PASSWORD_RESET_IP_LIMIT = {
  maxAttempts: 10,
  windowMs: 60 * 60 * 1000,
  blockDurationMs: 60 * 60 * 1000,
};

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
  const ip = resolveClientIp(headersList);
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

  const { data, error } = await signInWithPasswordResilient(supabase, {
    email: normalizedEmail,
    password,
  });

  if (error || !data.user) {
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

  // Replace any stale marker from the previous session in the same response
  // that sets the fresh Supabase auth cookies. Otherwise middleware sees the
  // valid new user plus stale activity and immediately signs them out again.
  await resetSessionIdleMarker();

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
    // NOT `!onboarding_completed -> '/golf/coach'`. That flag is false for both
    // a PENDING and an APPROVED assistant coach, and '/golf/coach' is
    // new-program onboarding — completing it overwrites their
    // organization_id and detaches them from the program they joined. The
    // resolver keys on the golf_team_coach_staff row instead, which is the same
    // thing the RLS access helpers read. See lib/golf/coach-entry-path.ts.
    const entry = await resolveGolfCoachEntry(data.user.id);
    redirectTo = entry.path;
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
/**
 * What the signup form may ask for.
 *
 * `assistant_request` is deliberately NOT a role — it is a request for one. It
 * exists because the head coach and the assistant share ONE code (the team
 * join code), so the choice has to be made in the UI rather than sealed into a
 * separate credential. Everyone holding that code is on the roster, so letting
 * the choice grant itself would let any player self-promote to assistant coach
 * and read every teammate's rounds and PII. That is the escalation reverted in
 * 266d02d91 (2026-08-05); the approval step below is what lets the single-code
 * flow ship without re-opening it.
 */
export type GolfSignupRole = 'player' | 'coach' | 'assistant_request';

async function signupActionImpl(
  email: string,
  password: string,
  role: GolfSignupRole,
  firstName?: string,
  lastName?: string
): Promise<SignupResult> {
  const normalizedEmail = email.toLowerCase().trim();

  // An assistant-coach REQUEST is a coach account as far as auth is concerned;
  // what makes it a request rather than a grant is that no
  // golf_team_coach_staff row is written for it below. Both access helpers
  // (is_golf_team_coach / is_golf_team_head_coach) read that table and nothing
  // else, so until a head coach approves, this account can see no team data.
  const authRole: 'player' | 'coach' = role === 'assistant_request' ? 'coach' : role;

  // Validate password strength FIRST (before rate limiting to provide immediate feedback)
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    return {
      success: false,
      error: passwordValidation.feedback[0] || 'Password does not meet security requirements',
    };
  }

  const headersList = await headers();
  const ip = resolveClientIp(headersList);

  // Check rate limit
  const rateLimit = await checkRateLimit(`signup:ip:${ip}`, RATE_LIMITS.SIGNUP);

  if (!rateLimit.allowed) {
    const remaining = formatTimeRemaining(rateLimit.resetAt - Date.now());
    return {
      success: false,
      error: `Too many signup attempts. Please try again in ${remaining}.`,
    };
  }

  // B8-1: the access-code gate was enforced ONLY in the signup page's client
  // component — nothing server-side ever re-checked it, so this action was
  // directly POST-able and the gate was decorative. verifySignupGate re-runs
  // the FULL check (global SIGNUP_ACCESS_CODE or a live golf_teams.join_code)
  // against the grant the gate recorded, so a coach-invited player using only
  // their team's join code still gets through exactly as before.
  //
  // Placed AFTER the IP rate limit deliberately: a miss falls through to a
  // service-role join_code lookup, which must stay behind a throttle.
  const gate = await verifySignupGate();
  if (!gate.passed) {
    logSecurityEvent('Golf signup attempted without a valid access-code grant', 'warning', {
      email: normalizedEmail,
      ip,
      sport: 'golf',
    }).catch(() => {});
    return {
      success: false,
      error: 'Your access code could not be verified. Please reload this page and enter your invite code again.',
    };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
    options: {
      data: {
        role: authRole,
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
    // DS: this branch is a deliberate account-existence oracle — an
    // unauthenticated caller can learn whether an email is already
    // registered. That's an intentional UX tradeoff (clear "sign in instead"
    // guidance beats a vague generic error here) and is inconsistent with
    // requestPasswordResetAction's always-generic response below on purpose,
    // not by accident. Revisit only as a deliberate product decision, not a
    // silent fix — see 2026-08-01 audit finding on signup enumeration.
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
    await logServerError(`[Golf Auth Error]: ${describeError(error)}`, { action: 'auth.signupAction' });
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
  logSignup(data.user.id, normalizedEmail, authRole, { ip }).catch(() => {});

  // Auth state changed (session established) — revalidate dashboard like loginAction
  // so server components re-read the new authenticated session.
  revalidatePath('/golf/dashboard');

  // Redirect based on role - coaches go to coach onboarding, players go to player onboarding.
  //
  // A PLAYER who cleared the gate with their coach's team join code carries it
  // into onboarding as `?joinCode=`, which completePlayerOnboarding already
  // consumes to auto-join the inviting team on completion (the same parameter
  // the /golf/join/[code] invite link uses).
  //
  // Without this the code was verified and then thrown away in the same
  // breath: a coach-invited player cleared the gate, finished onboarding with
  // no team attached, and had to be invited a second time. Coaches keep going
  // to their own onboarding — a join code is meaningless for them, since they
  // create the team rather than join one.
  // A STAFF INVITE CODE cleared the gate: attach them to the inviting program
  // instead of running new-program onboarding (which would mint a duplicate
  // organization — the failure the owner's assistant would otherwise hit).
  //
  // The role is NOT taken from `role` above. It is read from the signed token
  // the code resolves to, inside redeemStaffInvite. That is the whole reason
  // this is safe to expose at signup: typing a code cannot choose a role, and
  // the roster join_code lives in a different namespace entirely, so a player
  // credential can still only ever produce a player.
  if (gate.staffInviteCode) {
    const token = await resolveStaffInviteCode(gate.staffInviteCode);
    if (token) {
      const redeemed = await redeemStaffInvite(
        token,
        [firstName, lastName].filter(Boolean).join(' ').trim() || undefined,
      );
      if (redeemed.success) {
        return { success: true, redirectTo: '/golf/dashboard' };
      }
      // The account EXISTS at this point, so failing the whole signup would
      // strand them with credentials and no program. Send them to the accept
      // screen, which states the real reason (expired / already used) and lets
      // them retry with a fresh code once signed in.
      await logServerError(
        `[signupAction] staff invite redemption failed after account creation: ${redeemed.error ?? 'unknown'}`,
        { action: 'auth.signupAction' },
        'warning',
      );
    }
    return { success: true, redirectTo: `/golf/staff/join/${encodeURIComponent(gate.staffInviteCode)}` };
  }

  // ASSISTANT COACH on the shared team code — attached IMMEDIATELY.
  //
  // Creates a real coach profile bound to the inviting PROGRAM and writes a
  // golf_team_coach_staff row for every team in it. Those rows are the whole of
  // team access — both is_golf_team_coach and is_golf_team_head_coach are
  // EXISTS() over that table and read nothing else — so writing them is what
  // makes the account work on first sign-in, with no waiting page in between.
  //
  // There is deliberately NO approval step (owner decision 2026-08-20): "The
  // approval is them having the access code, and putting it in when they hit
  // sign up." See joinTeamAsAssistantCoach in actions/teams.ts for the
  // trade-off that decision accepts.
  //
  // Anchored to gate.teamJoinCode, never to anything the browser sent: without
  // a team code there is no program to join, and the signup is refused rather
  // than silently downgraded to a stray coach account.
  // A ROSTER CODE OUTRANKS THE ROLE THE BROWSER SENT.
  //
  // `role` arrives from the client. The form derives 'assistant_request' from
  // the resolved code scope, but the server never checked that, so a submission
  // of role:'coach' carrying a roster code skipped the branch below and fell
  // through to `role === 'coach' ? '/golf/coach'` — new-program onboarding, the
  // duplicate-organization dead end this whole change exists to close.
  //
  // That is not hypothetical during a deploy. Anyone still holding the PREVIOUS
  // bundle is holding the one that offers "Coach" on a roster code, and their
  // tab posts to the NEW server — so the promote that fixes this also opens the
  // window where it fires, for exactly the Guilford and Shenandoah users who are
  // retrying right now.
  //
  // Holding a team code means joining THAT program; it cannot mean creating a
  // new one. The staff-invite branch above already defends itself this way
  // (see its comment: "typing a code cannot choose a role") — this is the same
  // rule for the roster path, which was the one missing it.
  const roleForGate: GolfSignupRole =
    gate.teamJoinCode && role === 'coach' ? 'assistant_request' : role;

  if (roleForGate === 'assistant_request') {
    if (!gate.teamJoinCode) {
      return {
        success: false,
        error: 'Assistant coaches need their team\'s code. Ask your head coach for it and try again.',
      };
    }
    const joined = await joinTeamAsAssistantCoach(
      data.user.id,
      gate.teamJoinCode,
      [firstName, lastName].filter(Boolean).join(' ').trim() || undefined,
      normalizedEmail,
    );
    if (!joined.success) {
      // The auth account exists by now, so refusing the whole signup would
      // strand them with credentials and nothing to sign into. But unlike the
      // old request-and-wait flow, a failure here means they genuinely have NO
      // team access — so say so instead of sending them to a dashboard that
      // would render empty.
      await logServerError(
        `[signupAction] assistant coach team attach failed after account creation: ${joined.error ?? 'unknown'}`,
        { action: 'auth.signupAction' },
        'error',
      );
      return {
        success: false,
        error: joined.error ?? 'We created your account but could not add you to the team. Please sign in and try again.',
      };
    }
    // Straight to the dashboard. They are on the team.
    return { success: true, redirectTo: '/golf/dashboard' };
  }

  // `roleForGate`, not `role` — a roster code has already been resolved to
  // 'assistant_request' above and handled there, so reaching this line with a
  // team code in hand and 'coach' selected is no longer possible. Reading the
  // gated value here too means a future edit cannot reopen that path by
  // accident.
  const carryJoinCode = roleForGate === 'player' && gate.teamJoinCode;
  const redirectTo = roleForGate === 'coach'
    ? '/golf/coach'
    : carryJoinCode
      ? `/golf/player?joinCode=${encodeURIComponent(gate.teamJoinCode as string)}`
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
  role: GolfSignupRole,
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

  // DS: this endpoint is unauthenticated and previously had no per-IP limit —
  // the per-email bucket above bounds requests to ANY ONE address, but a
  // single caller could still email-bomb an unbounded number of DIFFERENT
  // addresses. Mirror loginAction/signupAction's IP-keyed check.
  //
  // Keyed on ip+email (not ip alone), sized like DEMO_GATE: college teams
  // share one campus-wifi egress IP, so a plain ip-only bucket lets the
  // 4th teammate to forget their password in an hour exhaust the whole
  // team's budget and get told a reset link was sent when it wasn't. Keying
  // on ip+email gives each teammate their own budget at that IP while still
  // bounding how many times any single (ip, email) pair can be hammered.
  const headersList = await headers();
  const ip = resolveClientIp(headersList);
  const ipRateLimit = await checkRateLimit(
    `password-reset:ip:${ip}:${normalizedEmail}`,
    PASSWORD_RESET_IP_LIMIT,
  );
  if (!ipRateLimit.allowed) {
    // Same generic response as the email-keyed branch above — don't reveal
    // which limit tripped.
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
    `${getAppBaseUrl()}/golf/reset-password`,
    'GolfHelm',
  );
  const error = outcome === 'send-failed' || outcome === 'link-failed' || outcome === 'unconfigured'
    ? { message: `password reset delivery: ${outcome}` }
    : null;

  if (error) {
    await logServerError(`[Golf Auth Error]: ${error.message}`, {
      action: 'auth.requestPasswordResetAction',
      source: 'auth',
      sport: 'golf',
    });
  }

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


// ---------------------------------------------------------------------------
// Staff-invite signup (invited assistant coaches / program admins)
// ---------------------------------------------------------------------------

/**
 * Create an account for someone holding a coach-issued STAFF INVITE.
 *
 * WHY THIS EXISTS SEPARATELY FROM signupAction
 * --------------------------------------------
 * `signupAction` is gated by `verifySignupGate()` — a global access code or a
 * live `golf_teams.join_code`. Neither is something an invited assistant coach
 * has: the join code is the PLAYER code, handed to the whole roster, and the
 * product deliberately does not let a join code confer staff access (see the
 * header of src/lib/golf/staff-invite.ts). So an invited assistant had no way
 * to create an account at all — the failure a customer hit on 2026-08-18.
 *
 * The invite token replaces the gate, and is strictly STRONGER than the one it
 * replaces: it is HMAC-signed, expiry-bounded, and can only have been minted by
 * someone already holding head_coach on that team. The role is NOT taken from
 * this call — it travels inside the signed payload and is read again by
 * `redeemStaffInvite`, which the caller invokes next to actually attach the
 * staff row.
 *
 * This account is created with NO profile row (same as signupAction, which only
 * writes auth metadata); `redeemStaffInvite` creates the golf_coaches row bound
 * to the INVITING organization. That ordering is what stops an invited coach
 * from minting a duplicate phantom program, which is what the old
 * "pick Coach at signup" path did.
 *
 * The error branches below intentionally mirror signupActionImpl's. They are
 * duplicated rather than shared because this landed as a customer-facing
 * hotfix and refactoring the live signup path was the larger risk; if a third
 * caller appears, extract them.
 */
export interface StaffInviteSignupResult {
  success: boolean;
  error?: string;
}

async function signupWithStaffInviteActionImpl(
  token: string,
  email: string,
  password: string,
  fullName: string,
): Promise<StaffInviteSignupResult> {
  // The invite IS the authorization — verify it before anything else, so an
  // invalid token cannot even consume the signup rate limit.
  const verified = verifyStaffInvite(token);
  if (!verified.ok) {
    return {
      success: false,
      error:
        verified.reason === 'expired'
          ? 'That invitation has expired. Ask your head coach for a new one.'
          : verified.reason === 'unconfigured'
            ? 'Staff invites are unavailable right now.'
            : 'That invitation link is not valid.',
    };
  }

  const normalizedEmail = email.trim().toLowerCase();

  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    return {
      success: false,
      error: passwordValidation.feedback[0] || 'Password does not meet security requirements',
    };
  }

  const headersList = await headers();
  const ip = resolveClientIp(headersList);

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
        role: 'coach',
        sport: 'golf',
        first_name: fullName.trim().split(/\s+/)[0] ?? '',
        last_name: fullName.trim().split(/\s+/).slice(1).join(' '),
      },
      emailRedirectTo: `${getAppBaseUrl()}/golf/dashboard`,
    },
  });

  if (error) {
    if (error.message.includes('security purposes') || error.message.includes('rate limit')) {
      const match = error.message.match(/after (\d+) seconds/);
      return {
        success: false,
        error: `Please wait ${match ? match[1] : '60'} seconds before trying again.`,
      };
    }
    if (error.message.includes('already registered') || error.message.includes('already exists')) {
      return {
        success: false,
        error: 'An account with this email already exists. Sign in first, then open this invite link again.',
      };
    }
    if (
      error.message.toLowerCase().includes('weak') ||
      error.message.toLowerCase().includes('easy to guess')
    ) {
      return {
        success: false,
        error: 'Please choose a stronger password — this one is too common or has appeared in a data breach.',
      };
    }
    await logServerError(`[Golf Staff Invite Signup]: ${describeError(error)}`, {
      action: 'auth.signupWithStaffInviteAction',
    });
    return { success: false, error: 'Failed to create account. Please try again.' };
  }

  if (!data.user) return { success: false, error: 'Failed to create account' };
  if (!data.session) {
    return {
      success: false,
      error: 'Account created but session could not be established. Please try signing in.',
    };
  }

  logSignup(data.user.id, normalizedEmail, 'coach', { ip }).catch(() => {});
  revalidatePath('/golf/dashboard');

  return { success: true };
}

const observedSignupWithStaffInviteAction = withAdminObserved(
  'signupWithStaffInviteAction',
  { sport: 'golf', feature: 'auth_onboarding' },
  signupWithStaffInviteActionImpl,
);

export async function signupWithStaffInviteAction(
  token: string,
  email: string,
  password: string,
  fullName: string,
): Promise<StaffInviteSignupResult> {
  return observedSignupWithStaffInviteAction(token, email, password, fullName);
}
