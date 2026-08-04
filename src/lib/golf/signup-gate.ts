import 'server-only';

import { cookies, headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit, RATE_LIMITS } from '@/lib/auth/supabase-rate-limit';
import { logServerError } from '@/lib/server-error-logger';

/**
 * GolfHelm signup access-code gate.
 *
 * B8-1: the gate used to exist ONLY in the signup page's client component —
 * nothing server-side re-checked it, so `signupAction` was directly POST-able
 * and the access code was decorative. Both halves of the gate now live here:
 *
 *   `grantSignupAccess(code)`  — the interactive check the signup page runs
 *                                (via the `validateAccessCode` server action),
 *                                which records a grant on success.
 *   `verifySignupGate()`       — the enforcement `signupAction` runs one
 *                                request later, when the typed code is gone.
 *
 * Deliberately a PLAIN module, not a `'use server'` action file: only
 * `validateAccessCode` should be POST-able from a browser. `verifySignupGate`
 * is an internal server-to-server call from `signupAction`.
 */

// Fires at most once per warm serverless instance so a misconfigured deploy
// is loud in server logs without spamming one row per signup-gate attempt.
let warnedMissingAccessCode = false;

/**
 * The grant the gate hands out.
 *
 * It deliberately carries the CODE ITSELF rather than a "gate passed" flag:
 * `verifySignupGate` re-validates the value from scratch (env compare + live
 * join_code lookup) on the signup request, so forging the cookie requires
 * knowing a code that would have passed the gate anyway. A bare flag would be
 * trivially forgeable, and a signed flag would need a new signing secret whose
 * absence would silently take signup down. HttpOnly keeps it out of document
 * scripts; the value is a shared invite code the user just typed, not a
 * credential we minted.
 */
const SIGNUP_GATE_COOKIE = 'helm_golf_signup_gate';

/** Long enough to fill in the signup form unhurried, short enough to age out. */
const SIGNUP_GATE_TTL_SECONDS = 60 * 60;

/**
 * DS-B2 follow-up: an unset SIGNUP_ACCESS_CODE silently disables the shared-
 * code signup path (see isAcceptedSignupCode below) — self-serve signup then
 * only works via a coach's team join_code. That's correct behavior for a
 * removed committed secret, but a misconfigured deploy (env var never set in
 * Vercel) must not fail silently. Page this loudly instead.
 */
async function warnMissingAccessCodeOnce(): Promise<void> {
  if (warnedMissingAccessCode) return;
  warnedMissingAccessCode = true;
  await logServerError(
    'SIGNUP_ACCESS_CODE is unset — shared-code signup is disabled; only team join_code signup will succeed',
    { action: 'access-code.validateAccessCode', source: 'auth' },
    'critical',
  ).catch(() => {});
}

/**
 * Client IP for the gate throttle.
 *
 * This is the first x-forwarded-for hop, which a caller can spoof — it matches
 * `getClientIdentifier` in lib/rate-limit.ts and every other auth call site in
 * this repo. There is no trusted-IP extraction here to adopt; introducing one
 * (Vercel's `x-vercel-forwarded-for`, or a trusted-proxy hop count) is a
 * platform-wide decision, not something to invent inside the signup gate.
 */
async function clientIp(): Promise<string> {
  const headersList = await headers();
  return (
    headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headersList.get('x-real-ip') ??
    'unknown'
  );
}

/**
 * The signup gate runs pre-auth (anon), and RLS only exposes join_code
 * lookups to authenticated users, so this check uses the admin client.
 * Best-effort: any failure (e.g. service-role key unavailable) returns false
 * rather than throwing, so the gate never crashes signup.
 */
async function isValidTeamJoinCode(code: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('golf_teams')
      .select('id')
      .eq('join_code', code.toUpperCase())
      .limit(1)
      .maybeSingle();
    return !error && Boolean(data);
  } catch {
    return false;
  }
}

/**
 * The accept/reject decision, with NO throttle of its own.
 *
 * Two kinds of code are accepted — both whitespace-tolerant and
 * case-insensitive:
 *   1. The global SIGNUP_ACCESS_CODE. No committed default: when the env var
 *      is unset this branch is simply disabled (see below).
 *   2. Any existing golf team's join_code — the code/link a coach shares to
 *      invite players (see invitePlayerToTeam). This lets a coach-invited
 *      player sign up with only the code their coach gave them, instead of
 *      also needing the separate global access code.
 *
 * Team join codes are alphanumeric ([A-Z2-9], e.g. "K7PQX4MN"); keep the
 * accepted charset in sync with the signup input's `pattern` in
 * golf/(auth)/signup/page.tsx.
 *
 * Every caller MUST rate-limit before reaching here — a miss falls through to
 * a service-role join_code lookup.
 */
type SignupCodeMatch = 'none' | 'global' | 'team_join_code';

async function classifySignupCode(candidate: string): Promise<SignupCodeMatch> {
  // DS-B2: no committed fallback. An unset SIGNUP_ACCESS_CODE used to make the
  // source-published literal the live gate value; empty now fails the guard
  // below closed, leaving only the team join_code path.
  const accessCode = (process.env.SIGNUP_ACCESS_CODE ?? '').trim();
  if (!accessCode) {
    await warnMissingAccessCodeOnce();
  } else if (candidate.toLowerCase() === accessCode.toLowerCase()) {
    return 'global';
  }

  // Otherwise accept a real team join code so coach-invited players get in.
  return (await isValidTeamJoinCode(candidate)) ? 'team_join_code' : 'none';
}

async function isAcceptedSignupCode(candidate: string): Promise<boolean> {
  return (await classifySignupCode(candidate)) !== 'none';
}

/**
 * Remember that this browser cleared the gate, so `signupAction` — a separate
 * request that never sees the typed code — can re-verify it.
 *
 * Best-effort by construction: if the cookie cannot be written the gate still
 * opens (the user keeps the UX they have today) and `signupAction` fails
 * closed with an actionable "re-enter your code" message. Never throw the gate.
 */
async function rememberSignupGrant(code: string): Promise<void> {
  try {
    const cookieStore = await cookies();
    cookieStore.set(SIGNUP_GATE_COOKIE, code, {
      path: '/',
      maxAge: SIGNUP_GATE_TTL_SECONDS,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
  } catch (error) {
    await logServerError(
      `signup gate grant cookie could not be set: ${error instanceof Error ? error.message : 'unknown'}`,
      { action: 'access-code.validateAccessCode', source: 'auth' },
      'warning',
    ).catch(() => {});
  }
}

/**
 * Validate the code entered at the signup gate and, on success, record the
 * grant so the signup request itself can re-verify it server-side.
 */
export async function grantSignupAccess(code: string): Promise<boolean> {
  const candidate = code.trim();
  if (!candidate) return false; // never let a blank code authorize signup

  // DS-B2: the gate runs pre-auth and every miss falls through to a
  // service-role join_code lookup, so an anonymous caller could hammer it as an
  // unlimited oracle. Same IP-keyed shape as demo-access.ts's public gate.
  //
  // B2-3: keyed through the DB-backed limiter, not lib/auth/rate-limit — with
  // no Upstash env that one degrades to a per-serverless-instance Map, so a
  // distributed caller got a fresh budget per lambda and the throttle bounded
  // nothing. SIGNUP carries no blockDurationMs, so a DB blip fails OPEN here
  // rather than sealing off signup.
  const rateLimit = await checkRateLimit(`signup:gate:${await clientIp()}`, RATE_LIMITS.SIGNUP);
  if (!rateLimit.allowed) return false; // gate returns a plain boolean; a throttle reads as "no"

  const accepted = await isAcceptedSignupCode(candidate);
  if (accepted) await rememberSignupGrant(candidate);
  return accepted;
}

/**
 * Server-side enforcement of the signup gate, called by `signupAction` before
 * it ever reaches `auth.signUp`.
 *
 * Re-validates the grant cookie's code from scratch — an absent/expired
 * cookie, a rotated global code, or a join_code whose team no longer exists
 * all read as "not gated". Returns a plain boolean; the caller decides what
 * the user sees.
 *
 * Throttled on its own key so a legitimate signup does not spend the
 * interactive gate's budget, and so this path cannot be used as an unbounded
 * join_code oracle either.
 */
export interface SignupGateResult {
  /** True when the recorded grant still validates. */
  passed: boolean;
  /**
   * The TEAM JOIN CODE the visitor cleared the gate with, when that is what
   * let them in (uppercased), otherwise null.
   *
   * Returned so `signupAction` can carry it into player onboarding as
   * `?joinCode=`, which is the parameter completePlayerOnboarding already uses
   * to auto-join the inviting team. Before this, a player who signed up with
   * the code their coach gave them cleared the gate and was then dropped on
   * onboarding with no team — the code was verified and discarded in the same
   * breath, so they finished onboarding unattached and had to be invited a
   * second time.
   *
   * Reuses the classification the gate already performed; it does NOT cost a
   * second service-role join_code lookup or a second throttle slot.
   */
  teamJoinCode: string | null;
}

export async function verifySignupGate(): Promise<SignupGateResult> {
  const denied: SignupGateResult = { passed: false, teamJoinCode: null };

  const cookieStore = await cookies();
  const granted = cookieStore.get(SIGNUP_GATE_COOKIE)?.value?.trim();
  if (!granted) return denied;

  const rateLimit = await checkRateLimit(
    `signup:gate:verify:${await clientIp()}`,
    RATE_LIMITS.SIGNUP,
  );
  if (!rateLimit.allowed) return denied;

  const match = await classifySignupCode(granted);
  if (match === 'none') return denied;

  return {
    passed: true,
    teamJoinCode: match === 'team_join_code' ? granted.toUpperCase() : null,
  };
}
