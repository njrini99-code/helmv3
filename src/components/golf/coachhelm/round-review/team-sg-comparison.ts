/**
 * Team cohort line for the round SG headline (deep audit row 46, owner
 * decision "team and tour"): the round's SG stays measured against the
 * Tour/LPGA curve, and this adds the same round against the player's own
 * team: the team's mean SG: Total per countable round over the window.
 *
 * Pure. The caller loads the team's completed non-test rounds; this drops
 * the current round and anything not countable, and returns null below
 * `minRounds` so a thin roster never prints a noisy comparison.
 */
import { isCountableRound, type CountableRoundInput } from '@/lib/golf/round-countable';

export const TEAM_SG_MIN_ROUNDS = 5;
export const TEAM_SG_WINDOW_DAYS = 90;

export interface TeamSgRoundRow extends CountableRoundInput {
  id: string;
  strokes_gained_total: number | null;
}

export interface TeamSgComparison {
  teamMean: number;
  rounds: number;
  /** This round's SG: Total minus the team mean; null when the round has no SG. */
  vsTeam: number | null;
}

export function computeTeamSgComparison(
  rows: readonly TeamSgRoundRow[],
  currentRoundId: string,
  roundSgTotal: number | null,
  minRounds = TEAM_SG_MIN_ROUNDS,
): TeamSgComparison | null {
  const values: number[] = [];
  for (const r of rows) {
    if (r.id === currentRoundId) continue;
    const sg = r.strokes_gained_total;
    if (sg == null || !Number.isFinite(sg)) continue;
    if (!isCountableRound(r)) continue;
    values.push(sg);
  }
  if (values.length < minRounds) return null;
  const teamMean = values.reduce((a, v) => a + v, 0) / values.length;
  const vsTeam =
    roundSgTotal != null && Number.isFinite(roundSgTotal) ? roundSgTotal - teamMean : null;
  return { teamMean, rounds: values.length, vsTeam };
}
