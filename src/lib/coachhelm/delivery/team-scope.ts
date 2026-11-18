import { loadPlayerTeamIds } from '../canary';

type AnyClient = Parameters<typeof loadPlayerTeamIds>[0];

/**
 * A player's insights come from the teams they are on now (prod audit 2026-11-15, N13P-16): the player feed read
 * `golf_coach_insights` by player alone, so a player who moved from Guilford to Demo University saw Guilford's reads on Demo's
 * CoachHelm, and their numbers disagreed with Home. An insight with no team (written before rows carried one) still shows.
 *
 * The PostgREST `or` filter for that scope, or null for no scope: a failed team read (logged by `loadPlayerTeamIds`) or a player on no
 * team keeps the old, unscoped read rather than hiding every read the player has.
 */
export function insightTeamFilter(teamIds: readonly string[] | null): string | null {
  const ids = (teamIds ?? []).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  return ids.length ? `team_id.in.(${ids.join(',')}),team_id.is.null` : null;
}

/** The filter for one player, read with the caller's session client. */
export async function playerInsightTeamFilter(supabase: AnyClient, playerId: string): Promise<string | null> {
  return insightTeamFilter(await loadPlayerTeamIds(supabase, playerId));
}

/** Adds the team scope to an insights query; a null filter leaves it as it is. Typed loosely, as `applyInsightVisibility` is: the builder's own generics are too deep to constrain here. */
export function scopeToTeams<Q>(query: Q, filter: string | null): Q {
  return filter ? (query as unknown as { or: (f: string) => Q }).or(filter) : query;
}
