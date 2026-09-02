'use server';

import { withAdminObserved } from '@/lib/admin/observed-action';
import { grantSignupAccessDetailed } from '@/lib/golf/signup-gate';

/**
 * What the signup UI is allowed to learn about an accepted code.
 *
 * `staff` and `roster` name the NAMESPACE the code came from — never a role and
 * never a grant. The role is still read only from the signed token inside
 * `redeemStaffInvite`, so this cannot be used to escalate: typing a roster code
 * and being told "roster" is exactly as powerful as typing it and being told
 * nothing.
 *
 * What it buys is the thing the UI was missing: with a ROSTER code the "Coach"
 * option is wrong, because coach signup runs new-program onboarding and mints a
 * duplicate organization. The UI could not tell before, so it offered both and
 * relied on a paragraph of explanation — which two customers walked straight
 * past (UNCW 2026-08-18, Shenandoah 2026-08-19).
 */
export type SignupCodeScope = 'staff' | 'roster' | 'generic' | 'invalid';

/**
 * Validates the code entered at the signup gate.
 *
 * Thin action boundary only — the gate itself (which codes are accepted, the
 * DB-backed IP throttle in front of the service-role join_code lookup, and the
 * grant recorded for `signupAction` to re-verify) lives in
 * `src/lib/golf/signup-gate.ts`.
 *
 * B8-1: this stays the ONLY browser-POSTable half of the gate. The enforcement
 * half (`verifySignupGate`) is imported directly by `signupAction`, so it is
 * never exposed as an action of its own.
 */
/**
 * What the gate reports back to the signup screen.
 *
 * `teamName` is populated ONLY for a roster code, and only so the role screen
 * can say "Join Guilford as…" rather than a bare "I am a…". A coach hands the
 * same code to players and to an incoming assistant, so the person typing it
 * has no other way to confirm they are joining the right program before they
 * commit to a role.
 */
export interface SignupCodeCheck {
  scope: SignupCodeScope;
  teamName: string | null;
}

async function validateAccessCodeImpl(code: string): Promise<SignupCodeCheck> {
  const { granted, kind, teamName } = await grantSignupAccessDetailed(code);
  if (!granted) return { scope: 'invalid', teamName: null };
  if (kind === 'staff_invite_code') return { scope: 'staff', teamName: null };
  if (kind === 'team_join_code') return { scope: 'roster', teamName };
  return { scope: 'generic', teamName: null };
}

const observedValidateAccessCode = withAdminObserved(
  'validateAccessCode',
  { sport: 'golf', feature: 'auth_onboarding' },
  validateAccessCodeImpl,
);

/**
 * Returns the accepted code's SCOPE, not a bare boolean.
 *
 * Callers that only need "did it pass" can compare against 'invalid'. The
 * signup page needs more than that — see SignupCodeScope above.
 */
export async function validateAccessCode(code: string): Promise<SignupCodeCheck> {
  return observedValidateAccessCode(code);
}
