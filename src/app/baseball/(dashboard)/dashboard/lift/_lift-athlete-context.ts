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
 * baseball_players.id -> baseball_teams.id (first active membership).
 *
 * A player can legitimately hold TWO active baseball_team_members rows
 * (JUCO + Showcase). Without the status filter + explicit limit(1),
 * .maybeSingle() errors with PGRST116 on a >1-row result and silently
 * degrades the entire Lift Lab to empty for that athlete.
 */
async function resolvePlayerTeamId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  playerId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('baseball_team_members')
    .select('team_id')
    .eq('player_id', playerId)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('[lift-athlete-context] resolvePlayerTeamId query failed', error);
    return null;
  }
  return (data?.team_id as string | undefined) ?? null;
}

/**
 * Full resolution chain: baseball playerId -> teamId -> organizationId ->
 * helm_lifting_athletes.id. Returns null at any step that cannot be
 * resolved (degrade-gracefully — the caller renders an honest empty state,
 * never an error, matching the existing player-lift read-model's contract).
 */
export async function resolvePlayerLiftAthleteContext(
  playerId: string,
): Promise<PlayerLiftAthleteContext | null> {
  if (!playerId) return null;

  const supabase = await createClient();
  const teamId = await resolvePlayerTeamId(supabase, playerId);
  if (!teamId) return null;

  const liftCtx = await resolveBaseballLiftingOrg(teamId);
  if (!liftCtx) return null;

  const athleteId = await resolveMyBaseballAthleteId(liftCtx.organizationId);
  if (!athleteId) return null;

  return { organizationId: liftCtx.organizationId, teamId, athleteId };
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
    console.error('[lift-athlete-context] hasReadinessCheckinToday query failed', error);
  }

  return data !== null;
}
