/**
 * Shrinkage for the verdict baseline (02-accuracy-standard §4, §11).
 *
 * TEMPORARY: Slice 1 (PR #2219, `src/lib/coachhelm/v3/support/shrink.ts`)
 * owns shrinkage for the whole engine. It had not merged when Slice 4 was
 * written, so this file carries the same formula under the same names
 * (`KAPPA`, `shrinkToward`, `keptShare`). Once #2219 lands, import those from
 * `@/lib/coachhelm/v3/support/shrink` and delete this file; the verdict
 * tests pin the numbers, so the switch is mechanical.
 *
 * Pure.
 */

/**
 * κ by the unit the family counts in (owner default for 00-overview open
 * question 8): 30 attempts for make rates and GIR, 20 shots for proximity and
 * SG per shot, 5 rounds for per-round rates, 8 rounds for scoring by par type.
 */
export const KAPPA = {
  attempts: 30,
  shots: 20,
  per_round_rate: 5,
  par_scoring_rounds: 8,
} as const;

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
