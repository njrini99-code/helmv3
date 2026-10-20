/**
 * Shrinkage toward the prior and the split-half stability check
 * (02-accuracy-standard §2 "Stability" and §4).
 *
 * "Display raw, rank shrunk": the card prints the raw count and range; ranking
 * and later verdicts use ŷ = (n·y + κ·μ)/(n + κ). At n = κ the player's number
 * is half theirs and half the prior's.
 *
 * Pure.
 */

/**
 * κ by the unit the family counts in (owner default for 00-overview open
 * question 8, until Slice 7 estimates σ²_noise / σ²_between from production):
 * 30 attempts for make rates and GIR, 20 shots for proximity and SG per shot,
 * 5 rounds for per-round rates, 8 rounds for scoring by par type.
 */
export const KAPPA = {
  attempts: 30,
  shots: 20,
  per_round_rate: 5,
  par_scoring_rounds: 8,
} as const;

export type KappaKey = keyof typeof KAPPA;

/** ŷ = (n·y + κ·μ)/(n + κ). n <= 0 returns the prior. */
export function shrinkToward(y: number, n: number, prior: number, kappa: number): number {
  if (!(n > 0)) return prior;
  if (!(kappa > 0)) return y;
  return (n * y + kappa * prior) / (n + kappa);
}

/** The share of the player's own number kept after shrinkage, n / (n + κ). */
export function keptShare(n: number, kappa: number): number {
  if (!(n > 0)) return 0;
  if (!(kappa > 0)) return 1;
  return n / (n + kappa);
}

export interface SplitHalfInput {
  /** Gap in the older half of the window's countable rounds (positive = worse). */
  gapOld: number;
  /** Gap in the newer half. */
  gapNew: number;
  /** Gap over the full window. */
  gapFull: number;
  nOld: number;
  nNew: number;
}

export interface SplitHalf {
  agrees: boolean;
  gap_old: number;
  gap_new: number;
  n_old: number;
  n_new: number;
}

/**
 * 02 §2: split the window's countable rounds into older and newer halves,
 * recompute the gap in each; `agrees` when both halves are worse than the
 * benchmark (same sign, positive) and the newer half keeps at least half of
 * the full gap. For a strength read pass the gaps negated.
 */
export function splitHalfStability(input: SplitHalfInput): SplitHalf {
  const { gapOld, gapNew, gapFull, nOld, nNew } = input;
  const agrees =
    nOld > 0 &&
    nNew > 0 &&
    gapFull > 0 &&
    gapOld > 0 &&
    gapNew > 0 &&
    gapNew >= 0.5 * gapFull;
  return { agrees, gap_old: gapOld, gap_new: gapNew, n_old: nOld, n_new: nNew };
}
