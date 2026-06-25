// =============================================================================
// src/lib/lifting/resolve-baseball-context.ts
//
// Baseball-context resolution helpers for the Helm Lifting Lab rewire (§6).
// Used by the rewired baseball lifting actions to map:
//   * active baseball team  →  organization_id (for helm_lifting_* queries)
//   * baseball_players.id   →  helm_lifting_athletes.id (athlete identity swap)
//
// These are READ-ONLY helpers — they never write to any table.
// The baseball performance dashboard actions (lifting.ts, lifting-v11.ts,
// player-today-lift.ts) import these to resolve Lab context before querying
// helm_lifting_* instead of baseball_lift_*.
//
// Called by Wave 2 / W2-G (Baseball backfill + dashboard REWIRE). Written in
// Wave 1 so W2-G can import without a merge conflict.
// =============================================================================

import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface BaseballLiftingContext {
  /** The organizations.id the active baseball team belongs to. */
  organizationId: string;
  /** The baseball_teams.id (unchanged — still used for team-scoped queries). */
  teamId: string;
}

export interface BaseballAthleteIdMap {
  /** baseball_players.id → helm_lifting_athletes.id */
  [baseballPlayerId: string]: string;
}

// -----------------------------------------------------------------------------
// resolveBaseballLiftingOrg
// Resolve the organization_id for a given baseball team.
// Returns null if the team has no organization (org-less teams are skipped in
// the backfill per §5.1).
// -----------------------------------------------------------------------------

export async function resolveBaseballLiftingOrg(
  teamId: string,
): Promise<BaseballLiftingContext | null> {
  const supabase = await createClient();

  const { data: team } = await supabase
    .from('baseball_teams')
    .select('id, organization_id')
    .eq('id', teamId)
    .maybeSingle();

  if (!team || !team.organization_id) return null;

  return {
    organizationId: team.organization_id as string,
    teamId: team.id as string,
  };
}

// -----------------------------------------------------------------------------
// resolveBaseballAthleteIds
// Map one or more baseball_players.id → helm_lifting_athletes.id for a given org.
// Returns a partial map — players not yet seeded in helm_lifting_athletes are
// absent (callers must handle missing entries gracefully).
// -----------------------------------------------------------------------------

export async function resolveBaseballAthleteIds(
  organizationId: string,
  baseballPlayerIds: string[],
): Promise<BaseballAthleteIdMap> {
  if (baseballPlayerIds.length === 0) return {};

  const supabase = await createClient();

  const { data: rows } = await fromUntyped(supabase, 'helm_lifting_athletes')
    .select('id, sport_player_id')
    .eq('organization_id', organizationId)
    .eq('sport', 'baseball')
    .in('sport_player_id', baseballPlayerIds) as {
    data: Array<{ id: string; sport_player_id: string }> | null;
  };

  const map: BaseballAthleteIdMap = {};
  for (const row of rows ?? []) {
    if (row.sport_player_id) {
      map[row.sport_player_id] = row.id;
    }
  }
  return map;
}

// -----------------------------------------------------------------------------
// resolveMyBaseballAthleteId
// For the currently-authenticated user: resolve their baseball_players.id →
// helm_lifting_athletes.id within the given org. Returns null if not found.
// Used by the player-self RLS surface (player-today-lift.ts rewire).
// -----------------------------------------------------------------------------

export async function resolveMyBaseballAthleteId(
  organizationId: string,
): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Find the baseball_player row for this user
  const { data: playerRow } = await supabase
    .from('baseball_players')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!playerRow) return null;

  const { data: athleteRow } = await fromUntyped(supabase, 'helm_lifting_athletes')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('sport', 'baseball')
    .eq('sport_player_id', playerRow.id as string)
    .maybeSingle() as { data: { id: string } | null };

  return athleteRow?.id ?? null;
}
