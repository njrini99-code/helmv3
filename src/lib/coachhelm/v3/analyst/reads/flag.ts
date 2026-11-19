import 'server-only';
import { isFlagEnabled } from '@/lib/flags/is-enabled';

/**
 * The CoachHelm reads flag (config/feature-flags.yml `coachhelm_reads_v1`, off everywhere). Team scoped, as the Miss
 * Compass (`v3/chat/visuals/miss-compass-flag.ts`): the registry's flag must be on for the environment AND the team must
 * be listed in `COACHHELM_READS_TEAM_IDS`. Fail closed: an unset or empty list is no team, and no team is off.
 */
export const READS_FLAG = 'coachhelm_reads_v1';
export const READS_TEAMS_ENV = 'COACHHELM_READS_TEAM_IDS';

/** The listed team ids: comma or space separated, blanks dropped. */
export function readsTeams(raw: string | undefined): ReadonlySet<string> {
  return new Set((raw ?? '').split(/[\s,]+/).map((t) => t.trim()).filter(Boolean));
}

export interface ReadsFlagDeps {
  flagOn?: () => boolean;
  teams?: string | undefined;
}

export function readsEnabled(teamId: string | null | undefined, deps: ReadsFlagDeps = {}): boolean {
  if (!teamId) return false;
  const teams = readsTeams('teams' in deps ? deps.teams : process.env[READS_TEAMS_ENV]);
  if (!teams.has(teamId)) return false;
  return (deps.flagOn ?? (() => isFlagEnabled(READS_FLAG)))();
}

/** The listed teams the flag is on for, or none. Read before any database call, so an unset list costs nothing. */
export function readsEnabledTeams(deps: ReadsFlagDeps = {}): string[] {
  const teams = [...readsTeams('teams' in deps ? deps.teams : process.env[READS_TEAMS_ENV])].sort();
  if (!teams.length) return [];
  return (deps.flagOn ?? (() => isFlagEnabled(READS_FLAG)))() ? teams : [];
}
