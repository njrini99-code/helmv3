import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/server-error-logger';

/**
 * Result of an access verification check.
 * - `allowed`: whether the user may read/write the scoped resource
 * - `reason`: which branch granted or denied access, for logging/debugging
 */
export interface VerifyResult {
  allowed: boolean;
  reason?: 'self' | 'coach' | 'denied';
}

/**
 * Verify that a given user is allowed to access a specific player's data.
 *
 * Access is granted if:
 *   1. The user IS the player (self-access), OR
 *   2. The user is a coach staffing ANY team the player is an active member of
 *      (multi-team-safe via `public.verify_coach_owns_player` RPC).
 *
 * The old per-file `verifyPlayerAccess` helpers incorrectly picked the
 * "first team in the coach's org" via `.limit(1)`, which silently denied
 * access for coaches staffing 2+ teams. This helper replaces them with a
 * single source of truth.
 *
 * Pass a custom supabase client (e.g. from a test) to inject mocks.
 */
export async function verifyPlayerAccess(
  playerId: string,
  userId: string,
  supabase?: SupabaseClient,
): Promise<VerifyResult> {
  const sb = supabase ?? (await createClient());

  // 1. Self-access check (cheapest; covers player viewing own data).
  const { data: ownPlayer, error: selfError } = await sb
    .from('golf_players')
    .select('id')
    .eq('id', playerId)
    .eq('user_id', userId)
    .maybeSingle();

  if (selfError) {
    await logServerError(
      `verifyPlayerAccess.self failed: ${selfError.message ?? String(selfError)}`,
      { action: 'auth.verifyPlayerAccess', playerId, userId },
    );
    return { allowed: false, reason: 'denied' };
  }
  if (ownPlayer) return { allowed: true, reason: 'self' };

  // 2. Coach-access check via RPC that inspects golf_team_coach_staff joins.
  const { data: isCoach, error: coachError } = await sb.rpc(
    'verify_coach_owns_player',
    { p_player_id: playerId, p_user_id: userId },
  );

  if (coachError) {
    await logServerError(
      `verifyPlayerAccess.coach failed: ${coachError.message ?? String(coachError)}`,
      { action: 'auth.verifyPlayerAccess', playerId, userId },
    );
    return { allowed: false, reason: 'denied' };
  }

  return { allowed: !!isCoach, reason: isCoach ? 'coach' : 'denied' };
}

/**
 * Verify that a user staffs the given team.
 *
 * Uses `public.verify_coach_owns_team` RPC under the hood, which joins
 * `golf_team_coach_staff` → `golf_coaches` on `user_id`.
 */
export async function verifyTeamAccess(
  teamId: string,
  userId: string,
  supabase?: SupabaseClient,
): Promise<VerifyResult> {
  const sb = supabase ?? (await createClient());

  const { data: isCoach, error } = await sb.rpc('verify_coach_owns_team', {
    p_team_id: teamId,
    p_user_id: userId,
  });

  if (error) {
    await logServerError(
      `verifyTeamAccess failed: ${error.message ?? String(error)}`,
      { action: 'auth.verifyTeamAccess', metadata: { teamId, userId } },
    );
    return { allowed: false, reason: 'denied' };
  }

  return { allowed: !!isCoach, reason: isCoach ? 'coach' : 'denied' };
}
