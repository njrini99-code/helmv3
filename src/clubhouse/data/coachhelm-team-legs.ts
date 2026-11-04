import 'server-only';
import type { ChStation, ChTeamLeg, ChTeamPlayer } from './coachhelm-team-shape';
import { STATIONS, TEAM_EARLY_ROUNDS, worstOf } from './coachhelm-team-shape';
import { holeRounds } from './round-scope';
import { MIN_SG_ROUNDS, type ChRound } from './season';
import { effectiveCount, weightedMean } from './stats-weight';

const noLeg = (rounds: number, missing: string): ChTeamLeg => ({ strokes: null, rounds, missing });

const LEG_OF: Record<ChStation, (r: ChRound) => number | null | undefined> = {
  tee: (r) => r.strokes_gained_tee,
  approach: (r) => r.strokes_gained_approach,
  short_game: (r) => r.strokes_gained_around_green,
  putting: (r) => r.strokes_gained_putting,
};

/** Each player's four legs and stored total, with Team Stats' filter and mean, so the figures match that page for the same player (W-TEAM-5). */
export function toChTeamLegs(rounds: readonly ChRound[], ids: readonly string[]): Map<string, Pick<ChTeamPlayer, 'legs' | 'total' | 'rounds' | 'early' | 'worst'>> {
  const out = new Map<string, Pick<ChTeamPlayer, 'legs' | 'total' | 'rounds' | 'early' | 'worst'>>();
  for (const id of ids) {
    const mine = rounds.filter((r) => r.player_id === id);
    const holes = holeRounds(mine);
    const legs = {} as Record<ChStation, ChTeamLeg>;
    for (const s of STATIONS) {
      const n = effectiveCount(holes, (r) => LEG_OF[s](r));
      legs[s] = n >= MIN_SG_ROUNDS ? { strokes: weightedMean(holes, (r) => LEG_OF[s](r)), rounds: n, missing: null } : noLeg(n, `Shows from ${MIN_SG_ROUNDS} rounds with shots.`);
    }
    const totalN = effectiveCount(holes, (r) => r.strokes_gained_total);
    const total = totalN >= MIN_SG_ROUNDS ? weightedMean(holes, (r) => r.strokes_gained_total) : null;
    out.set(id, { legs, total, rounds: mine.length, early: mine.length < TEAM_EARLY_ROUNDS, worst: worstOf(legs) });
  }
  return out;
}
