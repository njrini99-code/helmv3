import 'server-only';

import { cookies, headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit, RATE_LIMITS } from '@/lib/auth/supabase-rate-limit';
import { logServerError, logServerEvent } from '@/lib/server-error-logger';

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
 * An unset SIGNUP_ACCESS_CODE disables the shared-code signup path, leaving
 * only a coach's team join_code — which is now the INTENDED configuration: the
 * shared code was deliberately retired on 2026-08-04 so a player signs up with
 * the code their coach gave them and lands on that coach's roster.
 *
 * This was originally logged 'critical' on the theory that an unset env var
 * meant a misconfigured deploy. That is no longer true, and the alarm fired on
 * every signup — 10 CRITICAL incidents in one 24h window on 2026-08-05, all of
 * them the platform working as designed. A permanent critical that nobody can
 * action is worse than silence: it trains you to ignore the queue, and it
 * buries the real failures next to it.
 *
 * Kept as a one-shot 'info' so the state is still discoverable if someone
 * wonders why the shared code stopped working, without paging anyone.
 */
async function warnMissingAccessCodeOnce(): Promise<void> {
  if (warnedMissingAccessCode) return;
  warnedMissingAccessCode = true;
  await logServerEvent(
    'SIGNUP_ACCESS_CODE is unset — by design: signup is team join_code only',
    { action: 'access-code.validateAccessCode', source: 'auth' },
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
export type SignupCodeMatch =
  | 'none'
  | 'global'
  | 'team_join_code'
  | 'staff_invite_code';

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

  // A head-coach-minted STAFF code. Checked before the roster join code
  // because the two namespaces are deliberately separate and a staff code must
  // never be mistaken for (or satisfied by) a player credential.
  //
  // This is what makes "type a code, join as an assistant coach" safe: the code
  // IS the grant and it carries the role in a signed token, so there is nothing
  // for the joiner to pick and nothing to escalate. Typing the ROSTER join code
  // here can only ever produce a player — which is why the 2026-08-05 revert
  // (266d02d91) of "join code + role dropdown" stays reverted.
  if (await isValidStaffInviteCode(candidate)) return 'staff_invite_code';

  // Otherwise accept a real team join code so coach-invited players get in.
  return (await isValidTeamJoinCode(candidate)) ? 'team_join_code' : 'none';
}

/**
 * True when the candidate is a live, unexpired staff invite code.
 *
 * Only checks existence + expiry here; the ROLE and the team are read from the
 * signed token at redemption, never from this lookup. So the worst a forged row
 * in this table could do is open the signup gate — it cannot grant staff.
 */
async function isValidStaffInviteCode(candidate: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('golf_staff_invite_codes')
      .select('code, expires_at')
      .eq('code', candidate.toUpperCase())
      .maybeSingle();
    // A failed read must not read as "valid" — fail closed to the join-code path.
    if (error || !data) return false;
    return new Date(data.expires_at).getTime() > Date.now();
  } catch {
    return false;
  }
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
  return (await grantSignupAccessDetailed(code)).granted;
}

/**
 * Same gate, but it also reports WHICH KIND of code opened it.
 *
 * The kind was always computed here and then thrown away at the boundary, so
 * the signup UI could not tell a roster join_code from a head-coach staff code
 * and offered the same role picker for both. Picking "Coach" with a ROSTER code
 * runs new-program onboarding, which mints a fresh organization and team with
 * the signer as head coach — so an assistant handed the team link became head
 * coach of a phantom duplicate instead of joining the program that invited him.
 *
 * Reported twice: UNCW 2026-08-18, then Shenandoah 2026-08-19 despite the
 * explanatory note added after the first. A note is not a control.
 *
 * The kind is safe to expose: it says which NAMESPACE the code came from, never
 * a role and never a grant. The role still comes only from the signed token
 * inside `redeemStaffInvite`, so a roster credential can still only ever
 * produce a player.
 */
export async function grantSignupAccessDetailed(
  code: string,
): Promise<{ granted: boolean; kind: SignupCodeMatch }> {
  const candidate = code.trim();
  if (!candidate) return { granted: false, kind: 'none' }; // never let a blank code authorize signup

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
  // A throttle reads as "no", and reports kind 'none' — a rate-limited caller
  // must not learn which namespace a code belongs to.
  if (!rateLimit.allowed) return { granted: false, kind: 'none' };

  const kind = await classifySignupCode(candidate);
  if (kind === 'none') return { granted: false, kind };
  await rememberSignupGrant(candidate);
  return { granted: true, kind };
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
  /**
   * The STAFF INVITE CODE the visitor cleared the gate with, uppercased, or
   * null. Returned so `signupAction` can redeem it after creating the account —
   * the role is then read from the signed token that code resolves to, never
   * from anything the browser sent.
   */
  staffInviteCode: string | null;
}

export async function verifySignupGate(): Promise<SignupGateResult> {
  const denied: SignupGateResult = { passed: false, teamJoinCode: null, staffInviteCode: null };

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
    staffInviteCode: match === 'staff_invite_code' ? granted.toUpperCase() : null,
  };
}
