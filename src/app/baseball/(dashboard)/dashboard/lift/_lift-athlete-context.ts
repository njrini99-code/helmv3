// =============================================================================
// src/app/baseball/(dashboard)/dashboard/lift/_lift-athlete-context.ts
//
// Shared server-only helpers for the two Player Lift routes (home + session
// execution) now that both pages render the canonical Helm Lifting Lab
// components (src/components/lifting/players/*) instead of the legacy
// src/components/baseball/performance/PlayerLift{Home,Session}Client.
//
// Resolves the SELF-ONLY athlete identity chain used by the canonical
// /lifting/dashboard/lift routes (organization_id + helm_lifting_athletes.id)
// starting from the baseball_players.id the active-context resolver already
// gives us. Deliberately NOT placed under src/lib/baseball/read-models/ (that
// directory is frozen for this lane) — it composes the existing, allowed
// resolve-baseball-context helpers instead of querying helm_lifting_* itself
// where possible.
// =============================================================================

import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { logServerError } from '@/lib/server-error-logger';
import {
  resolveBaseballLiftingOrg,
  resolveMyBaseballAthleteId,
} from '@/lib/lifting/resolve-baseball-context';
import { resolveTeamTimezone, todayIsoInTz } from '@/lib/baseball/daily-contract/contract-day';

export interface PlayerLiftAthleteContext {
  organizationId: string;
  teamId: string;
  athleteId: string;
}

/**
 * baseball_players.id -> ALL active baseball_teams.id memberships.
 *
 * A player can legitimately hold TWO active baseball_team_members rows
 * (High School + Showcase). Previously this collapsed the set to the earliest row
 * via `.limit(1).maybeSingle()`; if THAT team's org had no Lift Lab athlete
 * seeded, resolution failed even though the player's other active team
 * would have resolved fine. Return the full ordered list so the caller can
 * try each membership in turn.
 */
async function resolvePlayerTeamIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  playerId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('baseball_team_members')
    .select('team_id')
    .eq('player_id', playerId)
    .eq('status', 'active')
    .order('created_at', { ascending: true });
  if (error) {
    await logServerError(
      `[lift-athlete-context] resolvePlayerTeamIds query failed: ${error.message}`,
      { action: 'baseball.liftAthleteContext.resolvePlayerTeamIds', metadata: { playerId } },
    );
    return [];
  }
  return (data ?? [])
    .map((row) => row.team_id as string | undefined)
    .filter((teamId): teamId is string => Boolean(teamId));
}

/**
 * Full resolution chain: baseball playerId -> teamId -> organizationId ->
 * helm_lifting_athletes.id. Tries EVERY active team membership (High School +
 * Showcase dual-team players) before giving up, since a Lift Lab athlete row
 * may only be seeded for one of the player's active teams/orgs. Returns null
 * only once all active memberships have been exhausted (degrade-gracefully
 * — the caller renders an honest empty state, never an error, matching the
 * existing player-lift read-model's contract).
 */
export async function resolvePlayerLiftAthleteContext(
  playerId: string,
): Promise<PlayerLiftAthleteContext | null> {
  if (!playerId) return null;

  const supabase = await createClient();
  const teamIds = await resolvePlayerTeamIds(supabase, playerId);

  for (const teamId of teamIds) {
    const liftCtx = await resolveBaseballLiftingOrg(teamId);
    if (!liftCtx) continue;

    const athleteId = await resolveMyBaseballAthleteId(liftCtx.organizationId);
    if (!athleteId) continue;

    return { organizationId: liftCtx.organizationId, teamId, athleteId };
  }

  return null;
}

/** Whether the athlete has a helm_lifting_readiness_checkins row for today. */
export async function hasReadinessCheckinToday(
  athleteId: string,
  organizationId: string,
  teamId: string,
): Promise<boolean> {
  const supabase = await createClient();
  const today = todayIsoInTz(await resolveTeamTimezone(supabase, teamId));

  const { data, error } = (await fromUntyped(supabase, 'helm_lifting_readiness_checkins')
    .select('id')
    .eq('athlete_id', athleteId)
    .eq('organization_id', organizationId)
    .eq('checkin_date', today)
    .maybeSingle()) as { data: { id: string } | null; error: unknown };

  if (error) {
    await logServerError(
      `[lift-athlete-context] hasReadinessCheckinToday query failed: ${
        (error as Error)?.message ?? String(error)
      }`,
      {
        action: 'baseball.liftAthleteContext.hasReadinessCheckinToday',
        metadata: { athleteId, organizationId, teamId },
      },
    );
  }

  return data !== null;
}
