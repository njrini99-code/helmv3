/**
 * "GIR from Sand: 0%" when the player was never in sand.
 *
 * `ApproachDrill`'s by-lie rows do `finite(s?.girPctFromSand) ?? 0`, so a null
 * — which `safePercent` returns precisely when the denominator is zero —
 * renders a 0% bar. A player who has never had an approach from a bunker reads
 * identically to one who has been in six and hit none of them. On the Approach
 * drill, whose whole purpose is diagnosing where approaches go wrong, that is
 * the most misleading value on the panel.
 *
 * WORSE THAN THE BENTO EQUIVALENT, and live. Measured 2026-08-17 across the 42
 * players with completed rounds:
 *
 *   zero sand approaches   ->  6 players   render a fabricated "0%"
 *   1-4 sand approaches    -> 14 players   a rate from <=4 shots, unqualified
 *   rough / fairway        ->  0 players at zero (min 1, max 22 for sand)
 *
 * Twenty of forty-two — nearly half the roster — see a "GIR from Sand" number
 * they cannot act on. Compare the bento's GIR/fairway rows, where nobody in
 * production is at zero and the same defect is latent.
 *
 * The sample-size half is NOT fixed here, deliberately. `girByLie` computes
 * `{made, total}` for all three lies (golf-stats-calculator-shots.ts:2798-2801)
 * but the interface exposes only `girCountFromFairway` and `girCountFromRough`
 * — there is no `girCountFromSand`, so the denominator for the one lie that is
 * actually thin is computed and thrown away. Exposing it is a calculator change
 * with its own blast radius; this pins the honest-null half, which needs no new
 * field and stops the false zero today.
 */
import { describe, it, expect } from 'vitest';
import { buildGirByLieRows } from '@/components/golf/stats/spine-stage/ApproachDrill';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';

function stats(over: Partial<GolfStats>): GolfStats {
  return over as unknown as GolfStats;
}

describe('ApproachDrill — GIR by lie does not invent a zero', () => {
  it('renders an em-dash when the player was never in sand', () => {
    const sand = buildGirByLieRows(
      stats({ girPctFromFairway: 65, girPctFromRough: 45, girPctFromSand: null }),
    ).find((r) => r.label === 'Sand');

    expect(sand?.value).toBe('—');
    expect(sand?.dim).toBe(true);
  });

  it('still renders a REAL 0% from sand, undimmed', () => {
    // Six approaches from sand, none found the green. That is a finding, and
    // it must not be dimmed away with the no-data case.
    const sand = buildGirByLieRows(
      stats({ girPctFromFairway: 65, girPctFromRough: 45, girPctFromSand: 0 }),
    ).find((r) => r.label === 'Sand');

    expect(sand?.value).toBe('0%');
    expect(sand?.dim).toBeFalsy();
  });

  it('applies the same rule to fairway and rough', () => {
    const rows = buildGirByLieRows(
      stats({ girPctFromFairway: null, girPctFromRough: null, girPctFromSand: null }),
    );

    for (const label of ['Fairway', 'Rough', 'Sand']) {
      const row = rows.find((r) => r.label === label);
      expect(row?.value, label).toBe('—');
      expect(row?.dim, label).toBe(true);
    }
  });

  it('leaves real values alone', () => {
    const rows = buildGirByLieRows(
      stats({ girPctFromFairway: 65, girPctFromRough: 45, girPctFromSand: 25 }),
    );

    expect(rows.find((r) => r.label === 'Fairway')?.value).toBe('65%');
    expect(rows.find((r) => r.label === 'Rough')?.value).toBe('45%');
    expect(rows.find((r) => r.label === 'Sand')?.value).toBe('25%');
    expect(rows.every((r) => !r.dim)).toBe(true);
  });

  it('keeps the bar length at 0 for no-data so the rail reads empty, not full', () => {
    const sand = buildGirByLieRows(stats({ girPctFromSand: null })).find((r) => r.label === 'Sand');
    expect(sand?.pct).toBe(0);
  });
});

/**
 * The other half of c8284af93, now that the field exists.
 *
 * That commit fixed the fabricated zero but left the sample size, because
 * `girByLie` computes `{made, total}` for all three lies
 * (golf-stats-calculator-shots.ts:2798-2801) while the interface exposed only
 * `girCountFromFairway` and `girCountFromRough` — the denominator for the ONE
 * lie that is actually thin was computed and thrown away.
 *
 * Why it matters here more than anywhere: measured 2026-08-17, 6 of 42 players
 * have zero sand approaches and 14 more have between one and four. "GIR from
 * Sand: 33%" off three attempts is not a finding, and nothing on the row said
 * how many attempts there were.
 *
 * Rendered as a bare count (`n=3`) rather than made/attempts, because
 * `girCountFrom*` is the TOTAL — the made counts are not exposed, and deriving
 * them from pct x total would be reconstructing data rather than reporting it.
 * `n=` is the convention this codebase already uses for exactly this, in
 * `RampCell.n` and in ShortGameDrill's own miss-direction row.
 */
describe('ApproachDrill — GIR by lie carries its attempt count', () => {
  it('shows the attempt count for each lie', () => {
    const rows = buildGirByLieRows(
      stats({
        girPctFromFairway: 65, girCountFromFairway: 120,
        girPctFromRough: 45, girCountFromRough: 60,
        girPctFromSand: 33, girCountFromSand: 3,
      }),
    );

    expect(rows.find((r) => r.label === 'Fairway')?.sample).toBe('n=120');
    expect(rows.find((r) => r.label === 'Rough')?.sample).toBe('n=60');
    // The whole point: 33% off three attempts must not read like 33% off sixty.
    expect(rows.find((r) => r.label === 'Sand')?.sample).toBe('n=3');
  });

  it('omits the count when there were no attempts', () => {
    // Already renders an em-dash for the value; adding "n=0" would be noise.
    const sand = buildGirByLieRows(
      stats({ girPctFromSand: null, girCountFromSand: 0 }),
    ).find((r) => r.label === 'Sand');

    expect(sand?.value).toBe('—');
    expect(sand?.sample).toBeUndefined();
  });

  it('omits the count rather than inventing one when the field is absent', () => {
    const sand = buildGirByLieRows(stats({ girPctFromSand: 25 })).find((r) => r.label === 'Sand');

    expect(sand?.value).toBe('25%');
    expect(sand?.sample).toBeUndefined();
  });
});
