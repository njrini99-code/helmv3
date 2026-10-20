/**
 * Benjamini–Hochberg across every hypothesis the engine evaluated for one
 * player in one run (02-accuracy-standard §2 and §5).
 *
 * Why BH and not Bonferroni (02 §5): at ≈ 60 tests a Bonferroni line of
 * p ≤ 0.0008 is out of reach for a 30-putt sample and would switch the engine
 * off; BH controls the expected share of false reads among the supported ones
 * at q, and a false read is cheap to correct at the next checkpoint.
 *
 * Pure.
 */

/** Owner default (00-overview open question 6): q = 0.10 per player per run. */
export const BH_Q = 0.1;

export interface BhResult {
  /** BH-adjusted p-value (the "q-value") per input, in input order; null where the input was null. */
  qAdj: Array<number | null>;
  /** Supported at `q` per input, in input order. */
  rejected: boolean[];
  /** Number of hypotheses counted (`m`), untestable ones included. */
  m: number;
}

/**
 * Step-up BH. `pValues` holds one entry per hypothesis evaluated in the run.
 * A `null` entry is a hypothesis the engine looked at but could not test (no
 * counts on the evidence): it still counts in `m`, as if p = 1, so leaving a
 * family untestable can never make the other reads easier to support.
 *
 * The adjusted value for rank i (ascending p) is min over j >= i of
 * p(j) · m / j, capped at 1; a hypothesis is supported when its adjusted value
 * is <= q, which is the same set as "reject all p(i) with i <= the largest i
 * where p(i) <= (i/m)·q" in 02 §11.
 */
export function benjaminiHochberg(pValues: ReadonlyArray<number | null>, q: number = BH_Q): BhResult {
  const m = pValues.length;
  const qAdj: Array<number | null> = pValues.map(() => null);
  const rejected = pValues.map(() => false);
  if (m === 0) return { qAdj, rejected, m };

  const ranked = pValues
    .map((p, i) => ({ p: p === null || !Number.isFinite(p) ? 1 : Math.min(1, Math.max(0, p)), i }))
    .sort((a, b) => a.p - b.p || a.i - b.i);

  let running = 1;
  for (let r = m - 1; r >= 0; r--) {
    const { p, i } = ranked[r]!;
    running = Math.min(running, (p * m) / (r + 1));
    if (pValues[i] !== null && Number.isFinite(pValues[i] as number)) {
      qAdj[i] = running;
      rejected[i] = running <= q;
    }
  }
  return { qAdj, rejected, m };
}
