/**
 * Team-marker floor for standing rows (audit row 19, 2026-09-28).
 *
 * `refresh_player_standing` writes a team average and percentile for any team
 * size. With one measured player the "team average" is the player's own value
 * and the percentile is a tautological 100; with two it is one teammate. 2 of
 * 47 production rows carried team_n = 1. Below the floor the team markers are
 * blanked at read time, the same way `applyTourBasis` withholds a Tour marker
 * that is not comparable. `team_n` is kept so a reader can say why.
 *
 * Pure: no Supabase.
 */

import type { PlayerStanding } from './types';

/** Minimum measured teammates (the player included) before a team marker shows. */
export const MIN_TEAM_N_FOR_MARKER = 3;

export function applyTeamFloor(standing: PlayerStanding): PlayerStanding {
  if (standing.team_n >= MIN_TEAM_N_FOR_MARKER) return standing;
  return { ...standing, team_avg: null, team_pct: null };
}
