import { holeRounds, isScoreCountable } from './round-scope';
import { countsForScoring, MIN_SG_ROUNDS, type ChRound } from './season';
import { effectiveCount, weightedMean } from './stats-weight';

/**
 * One source for "how many rounds" and "strokes gained" (SYS-7, QA-1). The same player read 2, 3 and 10 rounds and +0.5 and −6.1 on
 * different pages, because each page chose its own rounds. Every page now passes its window through here, so two figures can differ
 * only by the window each names.
 */

/**
 * The rounds a figure may read: rounds that count toward a score, with practice left out. An 18-hole total posted without its holes is
 * one of them; only strokes gained leaves it out, through `holeRounds`. Round lists still show everything.
 */
export function roundsForFigures<T extends { round_type: string | null }>(rounds: readonly T[]): T[] {
  return rounds.filter((r) => countsForScoring(r) && isScoreCountable(r as never));
}

export type ChLegKey = 'tee' | 'approach' | 'around' | 'putting';
const PICK: Record<ChLegKey, (r: ChRound) => number | null | undefined> = {
  tee: (r) => r.strokes_gained_tee,
  approach: (r) => r.strokes_gained_approach,
  around: (r) => r.strokes_gained_around_green,
  putting: (r) => r.strokes_gained_putting,
};

export type ChFigures = {
  /** Every round the window holds, the number a page prints beside the figures. */
  rounds: number;
  /** Of those, the ones with hole scores: the only ones strokes gained can read. */
  holeRounds: number;
  /** Per round, over the hole rounds; null under the floor of MIN_SG_ROUNDS. */
  legs: Record<ChLegKey, number | null>;
  /** The stored total's mean over the same rounds. Never the legs added up. */
  total: number | null;
};

/** One figure over some rounds: the mean, and how many rounds it rests on. Null under the floor, so a page shows no figure rather than a thin one. */
export function figureOver<T extends ChRound>(rounds: readonly T[], pick: (r: T) => number | null | undefined): { value: number | null; n: number } {
  const n = effectiveCount(rounds as T[], pick);
  return { value: n >= MIN_SG_ROUNDS ? weightedMean(rounds as T[], pick) : null, n };
}

/** Strokes gained and round counts for one player's rounds in one window. Pass rounds already cut to the window. */
export function figuresOver(rounds: readonly ChRound[]): ChFigures {
  const holes = holeRounds(rounds);
  return {
    rounds: rounds.length,
    holeRounds: holes.length,
    legs: { tee: figureOver(holes, PICK.tee).value, approach: figureOver(holes, PICK.approach).value, around: figureOver(holes, PICK.around).value, putting: figureOver(holes, PICK.putting).value },
    total: figureOver(holes, (r) => r.strokes_gained_total).value,
  };
}
