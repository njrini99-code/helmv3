import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/server-error-logger';

/**
 * Result of an access verification check.
 * - `allowed`: whether the user may read/write the scoped resource
 * - `reason`: which branch granted or denied access, for logging/debugging
 * - `coachId`: when granted via coach access, the matched coach.id from
 *   `golf_team_coach_staff`. Lets callers attribute writes without a second
 *   `golf_coaches` lookup (which is ambiguous for multi-org users).
 */
export interface VerifyResult {
  allowed: boolean;
  reason?: 'self' | 'coach' | 'denied';
  coachId?: string;
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
 * Uses `public.coach_id_for_team` RPC which returns the matched coach.id
 * from `golf_team_coach_staff` (or null if the user does not staff the team).
 * Returning the coach.id lets callers attribute writes without a second
 * `golf_coaches` lookup — that lookup is ambiguous for multi-org users with
 * more than one coach profile.
 */
export async function verifyTeamAccess(
  teamId: string,
  userId: string,
  supabase?: SupabaseClient,
): Promise<VerifyResult> {
  const sb = supabase ?? (await createClient());

  const { data: coachId, error } = await sb.rpc('coach_id_for_team', {
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

  if (typeof coachId === 'string' && coachId.length > 0) {
    return { allowed: true, reason: 'coach', coachId };
  }
  return { allowed: false, reason: 'denied' };
}

/**
 * Verify that the user may write to a specific insight by resolving the
 * insight's team_id and confirming the user staffs that team via
 * `golf_team_coach_staff`.
 *
 * Used by singleton dismiss/resolve/acknowledge handlers to add a defensive
 * server-side ownership filter on top of RLS — without this filter the
 * handlers key only on `.eq('id', insightId)` and rely entirely on the RLS
 * policy. Mirrors the bulk handler pattern but uses the canonical multi-org
 * -safe path (coach_id resolved via golf_team_coach_staff, not via a
 * `golf_coaches WHERE user_id = ?` lookup).
 *
 * Returns the insight's team_id on success so callers can scope the UPDATE
 * by `.eq('team_id', teamId)` and treat zero affected rows as 404.
 */
export interface VerifyInsightResult {
  allowed: boolean;
  reason?: 'coach' | 'not-found' | 'denied';
  teamId?: string;
  coachId?: string;
}

export async function verifyInsightAccess(
  insightId: string,
  userId: string,
  supabase?: SupabaseClient,
): Promise<VerifyInsightResult> {
  const sb = supabase ?? (await createClient());

  const { data: insight, error: lookupError } = await sb
    .from('golf_coach_insights')
    .select('id, team_id')
    .eq('id', insightId)
    .maybeSingle<{ id: string; team_id: string | null }>();

  if (lookupError) {
    await logServerError(
      `verifyInsightAccess.lookup failed: ${lookupError.message ?? String(lookupError)}`,
      { action: 'auth.verifyInsightAccess', metadata: { insightId, userId } },
    );
    return { allowed: false, reason: 'denied' };
  }

  if (!insight) {
    return { allowed: false, reason: 'not-found' };
  }

  if (!insight.team_id) {
    // Pre-canonical insights with no team_id can't be verified through the
    // canonical helper. Fail closed — these should not be writable through
    // the new handler path.
    return { allowed: false, reason: 'denied' };
  }

  const team = await verifyTeamAccess(insight.team_id, userId, sb);
  if (!team.allowed) {
    return { allowed: false, reason: 'denied' };
  }

  return {
    allowed: true,
    reason: 'coach',
    teamId: insight.team_id,
    coachId: team.coachId,
  };
}
