import 'server-only';
import { isFlagEnabled } from '@/lib/flags/is-enabled';

/**
 * The Miss Compass flag (config/feature-flags.yml `coachhelm_miss_compass_v1`, off everywhere). Team scoped: the registry's
 * flag must be on for the environment AND the team must be listed in `COACHHELM_MISS_COMPASS_TEAM_IDS`. Fail closed: an unset
 * or empty list is no team, and no team (a player's own Ask, a read with no team) is off.
 */
export const MISS_COMPASS_FLAG = 'coachhelm_miss_compass_v1';
export const MISS_COMPASS_TEAMS_ENV = 'COACHHELM_MISS_COMPASS_TEAM_IDS';

/** The listed team ids: comma or space separated, blanks dropped. */
export function missCompassTeams(raw: string | undefined): ReadonlySet<string> {
  return new Set((raw ?? '').split(/[\s,]+/).map((t) => t.trim()).filter(Boolean));
}

export function missCompassEnabled(teamId: string | null | undefined, deps: { flagOn?: () => boolean; teams?: string | undefined } = {}): boolean {
  if (!teamId) return false;
  const teams = missCompassTeams('teams' in deps ? deps.teams : process.env[MISS_COMPASS_TEAMS_ENV]);
  if (!teams.has(teamId)) return false;
  return (deps.flagOn ?? (() => isFlagEnabled(MISS_COMPASS_FLAG)))();
}
