import { holeRounds } from './round-scope';
import { lastTenRounds, roundsForFigures } from './figure-window';
import { MIN_SG_ROUNDS, type ChRound } from './season';
import { effectiveCount, weightedMean } from './stats-weight';

/**
 * A team's strokes gained, the one source (owner rule: one number lives in one place and comes from one source; DECISIONS, 4 Nov
 * wiring: "Team Stats' rounds, so one number shows across Stats and CoachHelm").
 *
 * Team stats and CoachHelm Team printed two figures for one team because each did its own sum: Stats pooled the window's rounds,
 * the board averaged each player's own mean. Both now call `teamStrokesGained` over the window they name, so the two can differ only
 * by the window, and at the board's window (each player's last ten, Stats' default) they are one value.
 *
 * The definition is Team stats' (A4): the rounds with their holes in the window, of the players who have three whole rounds with a
 * strokes-gained total there, pooled per round (per 18 holes). A leg is the mean of that leg over the same rounds; the total is the
 * mean of the stored per-round totals, never the legs added up. Pure and client-safe: no Supabase, no React.
 */
export interface ChTeamSg {
  /** The team's strokes gained a round against the baseline; null with no player at the floor. */
  total: number | null;
  /** Off the tee, approach, around the green, putting (Team stats' `LEGS` order); null where no counted round has that leg. */
  legs: [number | null, number | null, number | null, number | null];
  /** How many rounds the total rests on (rounds with a stored total, of the players at the floor). */
  rounds: number;
  /** The players at the floor, whose rounds are the ones read. */
  ready: ReadonlySet<string>;
  /** For each leg, how many of those players have a round with it. */
  legPlayers: [number, number, number, number];
}

const sgTotal = (r: ChRound) => r.strokes_gained_total;
const LEG_PICKS: ReadonlyArray<(r: ChRound) => number | null> = [(r) => r.strokes_gained_tee, (r) => r.strokes_gained_approach, (r) => r.strokes_gained_around_green, (r) => r.strokes_gained_putting];

/**
 * The team figure over a window. `windowHoleRounds` is the window's rounds that have their holes (`holeRounds`), every player's
 * together, already cut to the window by the caller; `playerIds` is the roster the figure may count.
 */
export function teamStrokesGained(windowHoleRounds: readonly ChRound[], playerIds: readonly string[]): ChTeamSg {
  const rounds = windowHoleRounds as ChRound[];
  const ready = new Set(playerIds.filter((id) => effectiveCount(rounds.filter((r) => r.player_id === id), sgTotal) >= MIN_SG_ROUNDS));
  const read = rounds.filter((r) => ready.has(r.player_id));
  const leg = (pick: (r: ChRound) => number | null) => weightedMean(read, pick);
  const having = (pick: (r: ChRound) => number | null) => new Set(read.filter((r) => pick(r) != null).map((r) => r.player_id)).size;
  return {
    total: weightedMean(read, sgTotal),
    legs: [leg(LEG_PICKS[0]!), leg(LEG_PICKS[1]!), leg(LEG_PICKS[2]!), leg(LEG_PICKS[3]!)],
    rounds: read.filter((r) => sgTotal(r) != null).length,
    ready,
    legPlayers: [having(LEG_PICKS[0]!), having(LEG_PICKS[1]!), having(LEG_PICKS[2]!), having(LEG_PICKS[3]!)],
  };
}

/**
 * The window CoachHelm Team reads, and Team stats' default: every roster player's newest ten counted 18-hole rounds (`lastTenRounds`),
 * together. Pass every loaded round; the cut is made here so the board and Stats cannot choose different rounds.
 */
export function teamLastTenRounds(rounds: readonly ChRound[], playerIds: readonly string[]): ChRound[] {
  const counted = roundsForFigures(rounds);
  return playerIds.flatMap((id) => lastTenRounds(counted.filter((r) => r.player_id === id)));
}

/** The team figure CoachHelm Team draws: `teamStrokesGained` over `teamLastTenRounds`. */
export function teamLastTenStrokesGained(rounds: readonly ChRound[], playerIds: readonly string[]): ChTeamSg {
  return teamStrokesGained(holeRounds(teamLastTenRounds(rounds, playerIds)), playerIds);
}
