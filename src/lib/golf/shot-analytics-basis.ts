/**
 * Shot-analytics basis rules (pure) for `src/app/golf/actions/shot-analytics.ts`,
 * kept out of that `'use server'` file so they can be unit tested.
 *
 * Audit row 31 (2026-09-28):
 *   - one basis: current AND prior-period fairway % / GIR % come from hole
 *     rows (`holeRates`). The prior period used to read round totals, so a
 *     trend could move because the two periods were counted differently;
 *   - minimum samples before a threshold rule ("three-putt rate > 10%") may
 *     name a weakness or a strength: two full rounds of holes, or 10 attempts
 *     for attempt-based rates;
 *   - the window that produced the data is labelled (`windowLabel`).
 */

/** Holes (two full rounds) before a hole-level rate may trigger a rule. */
export const MIN_HOLES_FOR_RULES = 36;
/** Recorded fairway opportunities (two rounds of 14) before the driving rule. */
export const MIN_FAIRWAYS_FOR_RULES = 28;
/** Attempts before an attempt-based rate (up-and-down, sand save, short putts,
 *  approach miss direction) may trigger a rule. */
export const MIN_ATTEMPTS_FOR_RULES = 10;

export interface BasisHole {
  par: number;
  fairway_hit: boolean | null;
  gir: boolean | null;
}

function pct(part: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((part / total) * 1000) / 10;
}

/**
 * Fairway % (par-4/5 holes with a recorded fairway result) and GIR % (holes
 * with GIR evaluated), with their denominators. The same function serves the
 * current and the prior period.
 */
export function holeRates(holes: readonly BasisHole[]): {
  fairwayPct: number | null;
  fairwaysTotal: number;
  girPct: number | null;
  girEvaluated: number;
} {
  const par45 = holes.filter((h) => h.par >= 4);
  const fairwaysTotal = par45.filter((h) => h.fairway_hit != null).length;
  const fairwaysHit = par45.filter((h) => h.fairway_hit === true).length;
  const girEvaluated = holes.filter((h) => h.gir !== null).length;
  const girHit = holes.filter((h) => h.gir === true).length;
  return {
    fairwayPct: pct(fairwaysHit, fairwaysTotal),
    fairwaysTotal,
    girPct: pct(girHit, girEvaluated),
    girEvaluated,
  };
}

/** Human label for the window every rate on the payload was computed over. */
export function windowLabel(requestedDays: number, effectiveDays: number): string {
  if (effectiveDays !== requestedDays) {
    return `Last ${effectiveDays} days (widened from ${requestedDays}: no rounds in the last ${requestedDays})`;
  }
  return `Last ${effectiveDays} days`;
}
