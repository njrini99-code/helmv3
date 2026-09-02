'use server';

import { createClient } from '@/lib/supabase/server';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { resolveGolfCoachEntry, type GolfCoachEntry } from '@/lib/golf/coach-entry-path';

/**
 * Where the CURRENT coach account belongs — for client components that have to
 * make the same routing decision the server entry points make.
 *
 * Takes no user id on purpose. The id comes from the session, so this cannot be
 * used to probe another account's onboarding state, and it needs no
 * authorization argument of its own beyond "are you signed in".
 *
 * The underlying resolver reads with the service role (see
 * lib/golf/coach-entry-path.ts for why), which is exactly why this wrapper must
 * never accept a caller-supplied id.
 */
async function getGolfCoachEntryImpl(): Promise<GolfCoachEntry | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return resolveGolfCoachEntry(user.id);
}

/**
 * Wrapped for Helm Bridge, like every other golf server action — the contract
 * in `__tests__/coverage-contract.observability.test.ts` enforces this, and it
 * matters more than usual here: this action decides where a coach account is
 * sent, so a silent failure routes somebody to the wrong onboarding rather
 * than showing them an error.
 *
 * `observeSoftFailures: false` — a `null` return is the ordinary
 * not-signed-in answer, not an incident. Thrown exceptions are still recorded.
 */
const observedGetGolfCoachEntry = withAdminObserved(
  'getGolfCoachEntry',
  { sport: 'golf', feature: 'auth_onboarding', observeSoftFailures: false },
  getGolfCoachEntryImpl,
);

export async function getGolfCoachEntry(): Promise<GolfCoachEntry | null> {
  return observedGetGolfCoachEntry();
}
