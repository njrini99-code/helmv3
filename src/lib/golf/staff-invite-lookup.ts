import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';

/**
 * Resolve a typed staff invite code to its signed token, or null.
 *
 * WHY THIS IS NOT IN actions/teams.ts
 * -----------------------------------
 * That file is `'use server'`, so every export there is an ACTION BOUNDARY —
 * a function the browser can POST to directly. An exported
 * `resolveStaffInviteCode(code)` would therefore have been a public endpoint
 * that turns a short code into the signed token behind it, which is the one
 * thing this design keeps server-side. The repo's coverage tripwire caught it
 * as an unwrapped export; the fix is not to wrap it but to move it out of the
 * action surface altogether, which is what `server-only` enforces here.
 *
 * Returns the TOKEN and nothing else. Every caller then runs the normal
 * verifyStaffInvite path, so an expired, tampered or already-redeemed invite
 * fails in exactly the same place a pasted link would.
 */
export async function resolveStaffInviteCode(code: string): Promise<string | null> {
  const candidate = code.trim().toUpperCase();
  if (!candidate) return null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('golf_staff_invite_codes')
    .select('token')
    .eq('code', candidate)
    .maybeSingle();

  if (error) {
    // A failed read must not read as "no such code" to a caller that might
    // treat that as a reason to fall through to some other credential path.
    await logServerError(
      `[resolveStaffInviteCode] lookup failed: ${describeError(error)}`,
      { action: 'teams.resolveStaffInviteCode', featureArea: 'teams' },
      'warning',
    );
    return null;
  }

  return data?.token ?? null;
}
