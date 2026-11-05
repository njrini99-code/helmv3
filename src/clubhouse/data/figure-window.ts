import { isCountableRound } from '@/lib/golf/round-countable';
import { holeRounds } from './round-scope';
import { countsForScoring, MIN_SG_ROUNDS, type ChRound } from './season';
import { effectiveCount, weightedMean } from './stats-weight';

/**
 * One source for "how many rounds" and "strokes gained" (SYS-7, QA-1). The same player read 2, 3 and 10 rounds and +0.5 and −6.1 on
 * different pages, because each page chose its own rounds. Every page now passes its window through here, so two figures can differ
 * only by the window each names.
 */

/** The rounds a figure may read: complete rounds that count, with practice left out. Round lists still show everything. */
export function roundsForFigures<T extends { round_type: string | null }>(rounds: readonly T[]): T[] {
  return rounds.filter((r) => countsForScoring(r) && isCountableRound(r as never));
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

const over = (rounds: readonly ChRound[], pick: (r: ChRound) => number | null | undefined) => (effectiveCount(rounds as ChRound[], pick) >= MIN_SG_ROUNDS ? weightedMean(rounds as ChRound[], pick) : null);

/** Strokes gained and round counts for one player's rounds in one window. Pass rounds already cut to the window. */
export function figuresOver(rounds: readonly ChRound[]): ChFigures {
  const holes = holeRounds(rounds);
  return {
    rounds: rounds.length,
    holeRounds: holes.length,
    legs: { tee: over(holes, PICK.tee), approach: over(holes, PICK.approach), around: over(holes, PICK.around), putting: over(holes, PICK.putting) },
    total: over(holes, (r) => r.strokes_gained_total),
  };
}

export type ChFigureWindow = 'season' | 'last10';

/** What every figure says beside it: its window, and the rounds it rests on. */
export function windowWords(window: ChFigureWindow, rounds: number): string {
  const n = `${rounds} ${rounds === 1 ? 'round' : 'rounds'}`;
  return window === 'season' ? `This season · ${n}` : `Last 10 · ${n}`;
}
