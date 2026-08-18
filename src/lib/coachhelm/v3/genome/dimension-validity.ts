/**
 * Retire dimension values produced by a formula we have since corrected.
 *
 * A genome row is upserted whole, so a stored vector is only ever as good as
 * the code that last computed it. When a dimension's formula is FIXED, every
 * genome computed before that carries a number the engine would no longer
 * produce — which is a different problem from staleness, and is not covered by
 * showing a "last refreshed" date. "Last refreshed Jul 7" is honest about age
 * and silent about correctness.
 *
 * ── WHY THIS CANNOT WAIT FOR THE NIGHTLY CRON ───────────────────────────────
 *
 * Measured against production 2026-08-18 over genomes on ACTIVE rosters:
 *
 *     genomes shown                                    48
 *     computed before the 2026-08-17 fixes             40
 *     ...still displaying a scrambling_rate value       8
 *     ...still displaying a miss_side_bias value        2
 *
 * Those forty cannot be repaired by recomputing. A genome is only rewritten
 * when its dimensions produce values, dimensions need >= 8 completed rounds
 * inside the 90-day window, and only 8 of the 28 currently-eligible players
 * clear that. For the rest every dimension refuses and the row is left exactly
 * as it is. Waiting is not a fix — it is what has already happened, nightly,
 * forty times.
 *
 * ── WHAT WAS WRONG ──────────────────────────────────────────────────────────
 *
 * `miss_side_bias` (#1500) read a two-value side off an eight-value compass,
 * discarding 58% of the side-carrying signal; the surviving subsample pointed
 * the WRONG WAY for players who cleared the sample floor, so a coach reading
 * "misses left" had them working the opposite fault. `scrambling_rate` (#1499)
 * was a proximity proxy rather than scrambling, and rated players "Wizard"
 * whose real scrambling was under 40%.
 *
 * Retiring means the dimension reports as uncomputed — the same honest-empty
 * state it uses for a player with too little data. An absent reading costs a
 * coach nothing; an inverted one costs them a practice block.
 */

import type { GenomeVector, DimensionResult } from './types';

/**
 * The day each dimension's formula last changed, `YYYY-MM-DD`.
 *
 * Only list a dimension here when the change alters what the number MEANS —
 * a bug fix, a vocabulary change, a recalibrated cutoff. A refactor that
 * produces identical output does not belong, because every entry costs real
 * readings on real screens.
 */
export const DIMENSION_FORMULA_EPOCH: Readonly<Record<string, string>> = {
  // #1500 — 2-value side read off an 8-value compass; inverted for some players.
  miss_side_bias: '2026-08-17',
  // #1499 — proximity proxy, not scrambling; cutoffs recalibrated with it.
  scrambling_rate: '2026-08-17',
};

const RETIRED: DimensionResult = { value: null, confidence: null };

/**
 * Drop any dimension in `vector` whose formula changed after `computedAt`.
 *
 * Pure and non-mutating. An unparseable or missing `computedAt` retires the
 * affected dimensions: unknown provenance cannot be shown to be post-fix, and
 * under-claiming is the safe direction.
 */
export function retireOutdatedDimensions(
  vector: GenomeVector,
  computedAt: string | null | undefined,
): GenomeVector {
  const stamp = computedAt ? Date.parse(computedAt) : NaN;
  const unknownProvenance = Number.isNaN(stamp);

  const out: GenomeVector = { ...vector };
  for (const [dimensionId, epoch] of Object.entries(DIMENSION_FORMULA_EPOCH)) {
    if (!(dimensionId in out)) continue;
    // Epoch is a calendar day; compare against its start so a genome computed
    // any time ON the fix day counts as post-fix.
    const epochMs = Date.parse(`${epoch}T00:00:00.000Z`);
    if (unknownProvenance || stamp < epochMs) {
      // A fresh object, and NO label — "Wizard" is the wrong claim, not just
      // the wrong number, so it must not survive the value it described.
      out[dimensionId] = { ...RETIRED };
    }
  }
  return out;
}
