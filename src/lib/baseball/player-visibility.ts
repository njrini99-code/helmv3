import 'server-only';

import type { createClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/server-error-logger';

type Supabase = Awaited<ReturnType<typeof createClient>>;

// =============================================================================
// src/lib/baseball/player-visibility.ts
//
// P0 PRIVACY — the ONE source of truth for two authorization predicates that
// gate whether a coach may see a player's recruiting profile / PII:
//
//   1. profile_visibility  — baseball_player_settings.profile_visibility.
//      Only an explicit 'private' row denies visibility; a missing settings
//      row, or any other value, defaults to visible/public. This is the exact
//      semantics assertCoachCanRecruitPlayer() (recruitability.ts) originated
//      and discover.ts's Discover/browse listings mirror.
//   2. own-roster          — player IDs on a team the coach staffs. A coach
//      may always see their own roster players regardless of
//      recruiting_activated / profile_visibility (this is not a recruiting
//      relationship at all).
//
// Both predicates now have ONE implementation each, imported by discover.ts,
// recruitability.ts, and player-peek.ts — do NOT add a third/fourth copy
// inline in a new caller; extend this module instead so every surface stays
// in lockstep.
// =============================================================================

/** Only this value denies visibility — see module doc above. */
export const PRIVATE_PROFILE_VISIBILITY = 'private' as const;

/**
 * Bulk form — player IDs whose profile_visibility is 'private'. Used to
 * exclude private players from a multi-row listing/count at the DB level
 * (.not('id', 'in', ...)) so pagination/counts stay correct even when many
 * players are private.
 */
export async function getPrivatePlayerIds(supabase: Supabase): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('baseball_player_settings')
    .select('player_id')
    .eq('profile_visibility', PRIVATE_PROFILE_VISIBILITY);

  if (error) {
    await logServerError(
      `Error fetching private player settings: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'player-visibility.getPrivatePlayerIds' },
    );
    // Fail open here (matches getCoachRosterPlayerIds' pattern below): this
    // side-query failing must not disable the caller's OTHER discoverability
    // filters (own-team / discoverable-team) that are applied independently.
    return new Set();
  }

  return new Set((data ?? []).map((s) => s.player_id).filter(Boolean));
}

/** Format a set of player IDs as a PostgREST `.not(col, 'in', ...)` value. */
export function formatIdListForNotIn(ids: Set<string>): string {
  return `(${[...ids].join(',')})`;
}

/**
 * Single-player form of getPrivatePlayerIds — is THIS player's
 * profile_visibility 'private'? Same semantics, for a single-player check
 * (player-peek panel, assertCoachCanRecruitPlayer) instead of a bulk listing
 * filter.
 */
export async function isPlayerProfilePrivate(
  supabase: Supabase,
  playerId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('baseball_player_settings')
    .select('profile_visibility')
    .eq('player_id', playerId)
    .maybeSingle();

  return data?.profile_visibility === PRIVATE_PROFILE_VISIBILITY;
}

/**
 * Player IDs on a coach's own roster(s) — teams the coach is staff on. Shared
 * by discover.ts (exclude own roster from Discover results — those players
 * are seen via roster, not Discover), recruitability.ts (own-roster players
 * are not "recruitable" — you already have them), and player-peek.ts (the
 * inverse: own-roster players ALWAYS pass the peek-panel gate, regardless of
 * recruiting_activated / profile_visibility — a coach may always view their
 * own players).
 */
export async function getCoachRosterPlayerIds(
  supabase: Supabase,
  coachId: string | undefined,
): Promise<Set<string>> {
  if (!coachId) return new Set();

  // head_coach_id does not exist on baseball_teams — get teams via
  // team_coach_staff.
  const { data: staffEntries } = await supabase
    .from('baseball_team_coach_staff')
    .select('team_id')
    .eq('coach_id', coachId);

  const teamIds = (staffEntries ?? []).map((e) => e.team_id).filter(Boolean);
  if (teamIds.length === 0) return new Set();

  const { data: rosterPlayers } = await supabase
    .from('baseball_team_members')
    .select('player_id')
    .in('team_id', teamIds);

  return new Set((rosterPlayers ?? []).map((p) => p.player_id).filter(Boolean));
}
