'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { withAdminObserved } from '@/lib/admin/observed-action';

/**
 * Validates the code entered at the signup gate.
 *
 * Two kinds of code are accepted — both whitespace-tolerant and
 * case-insensitive:
 *   1. The global SIGNUP_ACCESS_CODE (defaults to "1881").
 *   2. Any existing golf team's join_code — the code/link a coach shares to
 *      invite players (see invitePlayerToTeam). This lets a coach-invited
 *      player sign up with only the code their coach gave them, instead of
 *      also needing the separate global access code.
 *
 * Team join codes are alphanumeric ([A-Z2-9], e.g. "K7PQX4MN"); keep the
 * accepted charset in sync with the signup input's `pattern` in
 * golf/(auth)/signup/page.tsx.
 */
async function validateAccessCodeImpl(code: string): Promise<boolean> {
  const candidate = code.trim();
  if (!candidate) return false; // never let a blank code authorize signup

  const accessCode = (process.env.SIGNUP_ACCESS_CODE ?? '1881').trim();
  if (accessCode && candidate.toLowerCase() === accessCode.toLowerCase()) {
    return true;
  }

  // Otherwise accept a real team join code so coach-invited players get in.
  return isValidTeamJoinCode(candidate);
}

const observedValidateAccessCode = withAdminObserved(
  'validateAccessCode',
  { sport: 'golf', feature: 'auth_onboarding' },
  validateAccessCodeImpl,
);

export async function validateAccessCode(code: string): Promise<boolean> {
  return observedValidateAccessCode(code);
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
