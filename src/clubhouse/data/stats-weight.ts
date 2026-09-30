import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import { formStatus, MIN_SG_ROUNDS, TREND_LENGTH, type ChPlayerSeason, type ChRound } from './season';
import { per18, roundKind, type ChRoundKind } from './stats-filter';

export { per18, roundsWord } from './stats-filter';

/*
 * Nine- and eighteen-hole rounds on one page (the filter's Holes control).
 *
 * Every per-round figure is per 18 holes: a nine-hole round counts as half a round. The average of a figure
 * is its sum over the rounds that have it, divided by the rounds' summed weights (a nine-hole round weighs
 * 0.5), so a nine-hole score of 38 is a half round at 38, which is 76 a round. With eighteen-hole rounds only,
 * every weight is 1 and this is the plain mean. Hole-level and shot-level rates (greens, fairways, scrambling,
 * make rates) pool the holes and shots and need no weight. The floors (an early read, strokes gained's three
 * rounds) count the summed weights, so two nine-hole rounds are one round.
 */

export interface HoleCount {
  holes_played: number | null;
}

/** A round with a score. Its length is 9 or 18 (the countable rule), and the filter's Holes choice says which lengths a page counts. */
export const hasScore = (r: { total_score: number | null }): boolean => r.total_score != null;

/** 1 for an eighteen-hole round, 0.5 for a nine-hole round. */
export function roundWeight(r: HoleCount): number {
  return (r.holes_played ?? 18) / 18;
}

/** The rounds counted in whole rounds: 2 of 9 holes and 1 of 18 is 2. */
export function effectiveRounds(rounds: HoleCount[]): number {
  return rounds.reduce((a, r) => a + roundWeight(r), 0);
}

/** The summed weight of the rounds that have a value for `pick`: how many whole rounds a figure rests on. */
export function effectiveCount<T extends HoleCount>(rounds: T[], pick: (r: T) => number | null | undefined): number {
  return rounds.reduce((a, r) => (pick(r) == null ? a : a + roundWeight(r)), 0);
}

/** The per-18 mean of a figure over the rounds that have it; null when none does. */
export function weightedMean<T extends HoleCount>(rounds: T[], pick: (r: T) => number | null | undefined): number | null {
  let sum = 0;
  let weight = 0;
  for (const r of rounds) {
    const v = pick(r);
    if (v == null) continue;
    sum += v;
    weight += roundWeight(r);
  }
  return weight > 0 ? sum / weight : null;
}

/** Doubles or worse as a share of holes (production's big-number rate), from the rounds' cached counts over their holes. */
export function bigNumberRate(rounds: Array<HoleCount & { doubles: number | null; triples: number | null }>): number | null {
  let big = 0;
  let holes = 0;
  for (const r of rounds) {
    if (r.doubles == null || r.triples == null) continue;
    big += r.doubles + r.triples;
    holes += r.holes_played ?? 18;
  }
  return holes > 0 ? (big / holes) * 100 : null;
}

export interface ChWindowSeason extends ChPlayerSeason {
  /** The window's rounds in whole rounds (a nine-hole round is half), which the early-read floors count. */
  effRounds: number;
  /** The rounds with strokes gained, in whole rounds. */
  effSgRounds: number;
}

/**
 * One player's window as `summarizePlayer` reads a season, for eighteen- and nine-hole rounds together: every figure per 18,
 * the floors in whole rounds. `rounds` is newest first and already the filter's.
 */
export function summarizeWindow(rounds: ChRound[]): ChWindowSeason {
  const list = rounds.filter((r) => r.total_score != null);
  const score18 = (r: ChRound) => per18(r.total_score as number, r.holes_played);
  const trend = list.slice(0, TREND_LENGTH).map(score18).reverse();
  const half = Math.floor(trend.length / 2);
  const m = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const leg = (pick: (r: ChRound) => number | null) => (effectiveCount(list, pick) >= MIN_SG_ROUNDS ? weightedMean(list, pick) : null);
  const sgRows = list.filter((r) => r.strokes_gained_total != null);
  const effSg = effectiveCount(list, (r) => r.strokes_gained_total);
  return {
    rounds: list.length,
    effRounds: effectiveRounds(list),
    avg: weightedMean(list, (r) => r.total_score),
    toPar: weightedMean(list, (r) => r.score_to_par),
    trend,
    formChange: trend.length >= 3 ? m(trend.slice(trend.length - half)) - m(trend.slice(0, half)) : null,
    sgPerRound: effSg >= MIN_SG_ROUNDS ? weightedMean(list, (r) => r.strokes_gained_total) : null,
    sgRounds: sgRows.length,
    effSgRounds: effSg,
    sgLegs: {
      tee: leg((r) => r.strokes_gained_tee),
      approach: leg((r) => r.strokes_gained_approach),
      around: leg((r) => r.strokes_gained_around_green),
      putting: leg((r) => r.strokes_gained_putting),
    },
    status: formStatus(trend),
    recent: list.slice(0, 10),
    lastRoundDate: list[0]?.round_date ?? null,
  };
}

/**
 * The shot-level calculator's per-round counts (birdies, eagles, pars, bogeys, doubles) divide by the number of rounds whatever
 * their length, and its scoring average, its average to par and its scoring by round type leave nine-hole rounds out. With a
 * nine-hole round in the window they are restated per 18 (the counts from the same totals over the holes played, the scores from
 * the rounds' own weights); with none they are the calculator's own, untouched. Its per-round putts, greens, three-putts and
 * penalties are already per 18 holes, and its best and worst rounds are kept per length (`bestRound18`, `bestRound9`).
 */
export function perEighteen(s: GolfStats, rounds: ChRound[]): GolfStats {
  if (!rounds.some((r) => (r.holes_played ?? 18) !== 18) || !(s.holesPlayed > 0)) return s;
  const per = (total: number) => (total * 18) / s.holesPlayed;
  const avg = weightedMean(rounds, (r) => r.total_score);
  const ofKind = (k: ChRoundKind) => rounds.filter((r) => r.total_score != null && roundKind(r.round_type) === k);
  const typed = (k: ChRoundKind) => ({ avg: weightedMean(ofKind(k), (r) => r.total_score), n: ofKind(k).length });
  const [practice, qualifying, tournament] = [typed('practice'), typed('qualifier'), typed('tournament')];
  return {
    ...s,
    scoringAverage: avg,
    scoringAverage18: avg,
    avgScoreToPar: weightedMean(rounds, (r) => r.score_to_par),
    practiceScoringAvg: practice.avg,
    practiceRounds: practice.n,
    qualifyingScoringAvg: qualifying.avg,
    qualifyingRounds: qualifying.n,
    tournamentScoringAvg: tournament.avg,
    tournamentRounds: tournament.n,
    eaglesPerRound: per(s.totalEagles),
    birdiesPerRound: per(s.totalBirdies),
    fairwaysHitPerRound: per(s.fairwaysHit),
    parsPerRound: per(s.totalPars),
    bogeysPerRound: per(s.totalBogeys),
    doublePlusPerRound: per(s.totalDoublePlus),
  };
}
