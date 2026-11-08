import 'server-only';
import type { ChStation, ChTeamLeg, ChTeamPlayer } from './coachhelm-team-shape';
import { STATIONS, TEAM_EARLY_ROUNDS, worstOf } from './coachhelm-team-shape';
import { holeRounds } from './round-scope';
import { figureOver, lastTenRounds } from './figure-window';
import { MIN_SG_ROUNDS, type ChRound } from './season';

const noLeg = (rounds: number, missing: string): ChTeamLeg => ({ strokes: null, rounds, missing });

const LEG_OF: Record<ChStation, (r: ChRound) => number | null | undefined> = {
  tee: (r) => r.strokes_gained_tee,
  approach: (r) => r.strokes_gained_approach,
  short_game: (r) => r.strokes_gained_around_green,
  putting: (r) => r.strokes_gained_putting,
};

/** Each player's four legs and stored total over the shared window (`lastTenRounds`), so the figures match their Home and Stats (QA-1). */
export function toChTeamLegs(rounds: readonly ChRound[], ids: readonly string[]): Map<string, Pick<ChTeamPlayer, 'legs' | 'total' | 'rounds' | 'early' | 'worst'>> {
  const out = new Map<string, Pick<ChTeamPlayer, 'legs' | 'total' | 'rounds' | 'early' | 'worst'>>();
  for (const id of ids) {
    const mine = lastTenRounds(rounds.filter((r) => r.player_id === id));
    const holes = holeRounds(mine);
    const legs = {} as Record<ChStation, ChTeamLeg>;
    for (const s of STATIONS) {
      const { value, n } = figureOver(holes, LEG_OF[s]);
      legs[s] = value != null ? { strokes: value, rounds: n, missing: null } : noLeg(n, `Shows from ${MIN_SG_ROUNDS} rounds with shots.`);
    }
    const total = figureOver(holes, (r) => r.strokes_gained_total).value;
    out.set(id, { legs, total, rounds: mine.length, early: mine.length < TEAM_EARLY_ROUNDS, worst: worstOf(legs) });
  }
  return out;
}
