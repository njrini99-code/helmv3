'use server';

import { withAdminObserved } from '@/lib/admin/observed-action';
import { grantSignupAccess } from '@/lib/golf/signup-gate';

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
async function validateAccessCodeImpl(code: string): Promise<boolean> {
  return grantSignupAccess(code);
}

const observedValidateAccessCode = withAdminObserved(
  'validateAccessCode',
  { sport: 'golf', feature: 'auth_onboarding' },
  validateAccessCodeImpl,
);

export async function validateAccessCode(code: string): Promise<boolean> {
  return observedValidateAccessCode(code);
}
