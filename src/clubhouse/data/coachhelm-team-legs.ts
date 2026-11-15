import 'server-only';
import type { ChStation, ChTeamLeg, ChTeamPlayer } from './coachhelm-team-shape';
import { STATIONS, TEAM_EARLY_ROUNDS, worstOf } from './coachhelm-team-shape';
import { holeRounds } from './round-scope';
import { figureOver, lastTenRounds, roundsForFigures } from './figure-window';
import { MIN_SG_ROUNDS, type ChRound } from './season';

const noLeg = (rounds: number, missing: string): ChTeamLeg => ({ strokes: null, rounds, missing });

const LEG_OF: Record<ChStation, (r: ChRound) => number | null | undefined> = {
  tee: (r) => r.strokes_gained_tee,
  approach: (r) => r.strokes_gained_approach,
  short_game: (r) => r.strokes_gained_around_green,
  putting: (r) => r.strokes_gained_putting,
};

/** How many counted rounds this season a player needs before the huddle draws their trail: ten to start from and their last ten, sharing none (AC-HUDDLE-05). */
export const TRAIL_MIN_ROUNDS = 20;
const TRAIL_ROUNDS = 10;

/** The four legs over some rounds, by the one maths every leg on the board uses (`figureOver` over the rounds with their holes). */
function legsOver(rounds: readonly ChRound[]): Record<ChStation, { value: number | null; n: number }> {
  const holes = holeRounds(rounds);
  return Object.fromEntries(STATIONS.map((s) => [s, figureOver(holes, LEG_OF[s])])) as Record<ChStation, { value: number | null; n: number }>;
}

/**
 * A player's first ten counted 18-hole rounds this season, as legs, for the huddle's trail (02-PLAN 9.2 B). `counted` is the player's
 * `roundsForFigures` rounds; null under `TRAIL_MIN_ROUNDS` counted 18-hole rounds since `seasonStart`, so the first ten and the last
 * ten are different rounds. The maths is `legsOver`, the dot's own, so the two ends of a trail are on one basis.
 */
export function firstTenLegs(counted: readonly ChRound[], seasonStart: string): Record<ChStation, number | null> | null {
  const season = counted.filter((r) => (r.holes_played ?? 18) === 18 && r.round_date.slice(0, 10) >= seasonStart).sort((a, b) => (a.round_date < b.round_date ? -1 : a.round_date > b.round_date ? 1 : b.id.localeCompare(a.id)));
  if (season.length < TRAIL_MIN_ROUNDS) return null;
  const first = legsOver(season.slice(0, TRAIL_ROUNDS));
  return Object.fromEntries(STATIONS.map((s) => [s, first[s].value])) as Record<ChStation, number | null>;
}

/**
 * Each player's four legs and stored total over the shared window (`lastTenRounds`), so the figures match their Home and Stats (QA-1).
 * With `seasonStart`, also where they stood over their first ten rounds this season (`firstTenLegs`); without it, no trail.
 */
export function toChTeamLegs(rounds: readonly ChRound[], ids: readonly string[], seasonStart?: string): Map<string, Pick<ChTeamPlayer, 'legs' | 'total' | 'rounds' | 'early' | 'worst' | 'first10'>> {
  const out = new Map<string, Pick<ChTeamPlayer, 'legs' | 'total' | 'rounds' | 'early' | 'worst' | 'first10'>>();
  for (const id of ids) {
    const mine = lastTenRounds(rounds.filter((r) => r.player_id === id));
    const holes = holeRounds(mine);
    const over = legsOver(mine);
    const legs = {} as Record<ChStation, ChTeamLeg>;
    for (const s of STATIONS) {
      const { value, n } = over[s];
      legs[s] = value != null ? { strokes: value, rounds: n, missing: null } : noLeg(n, `Shows from ${MIN_SG_ROUNDS} rounds with shots.`);
    }
    const total = figureOver(holes, (r) => r.strokes_gained_total).value;
    out.set(id, { legs, total, rounds: mine.length, early: mine.length < TEAM_EARLY_ROUNDS, worst: worstOf(legs), first10: seasonStart ? firstTenLegs(roundsForFigures(rounds.filter((r) => r.player_id === id)), seasonStart) : null });
  }
  return out;
}
