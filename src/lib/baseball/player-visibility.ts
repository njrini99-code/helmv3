import 'server-only';

import type { createClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';

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
export async function getPrivatePlayerIds(supabase: Supabase): Promise<Set<string> | null> {
  const { data, error } = await supabase
    .from('baseball_player_settings')
    .select('player_id')
    .eq('profile_visibility', PRIVATE_PROFILE_VISIBILITY);

  // NULL means REFUSE — the same meaning `getDiscoverableTeamPlayerIds` carries
  // in discover.ts.
  //
  // This used to return an empty Set and call it "failing open, because the
  // caller's other filters still apply". That reasoning does not hold: this set
  // is the ONLY thing excluding private players, and every consumer treats an
  // empty set as "nobody is private" — two skip the `.not('id','in',...)`
  // exclusion entirely and one asks `.has(id)`. So a dropped connection put
  // players who had explicitly set their profile to private straight into
  // Discover listings, the org top-prospects strip, and the state counts.
  //
  // An empty set from a SUCCESSFUL read still means "nobody is private" and is
  // still returned as such.
  if (error) {
    await logServerError(
      `Error fetching private player settings; refusing rather than listing players who opted out: ${describeError(error)}`,
      { action: 'player-visibility.getPrivatePlayerIds' },
    );
    return null;
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
  const { data, error } = await supabase
    .from('baseball_player_settings')
    .select('profile_visibility')
    .eq('player_id', playerId)
    .maybeSingle();

  // Fails CLOSED, unlike the bulk form above. This is the PII gate — the
  // caller (assertCoachCanRecruitPlayer) turns `false` straight into
  // `{ allowed: true }` and hands over the player's contact details. Only
  // `data` was read here, so a dropped connection produced `false`, which does
  // not mean "the read came back empty", it means "this profile is NOT
  // private": a player who had explicitly opted out was exposed to a college
  // coach, and nothing was recorded.
  //
  // Every other gate in that function already fails closed by construction (a
  // failed player read leaves `player` null and denies; a failed
  // discoverable-teams read leaves that Set empty and denies). This one was the
  // outlier.
  //
  // The documented default is unchanged: `.maybeSingle()` returns
  // `{ data: null, error: null }` when a player simply has no settings row, and
  // that player is still public. A genuine miss is an answer. An error is not.
  if (error) {
    await logServerError(
      `Error reading profile visibility for player ${playerId}; treating as private: ${describeError(error)}`,
      { action: 'player-visibility.isPlayerProfilePrivate' },
    );
    return true;
  }

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
