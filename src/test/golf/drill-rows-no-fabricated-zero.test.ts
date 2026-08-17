/**
 * The last two drill row-groups that still invent a zero.
 *
 * Same rule as 705714002 / d8c689ec0 / c8284af93: these rows do
 * `finite(...) ?? 0`, so a null — which `safePercent` returns precisely when
 * the denominator is zero — renders a 0% bar. "Scrambling from 20-30 yds: 0%"
 * for a player who has never had a 20-30 yard scramble reads identically to one
 * who has had eight and converted none.
 *
 * Last cycle I said these were unmeasured and therefore untouched. Measured now,
 * across the 42 players with completed rounds:
 *
 *   scramblingPct20_30    5 at ZERO  + 12 at 1-4   -> 17 of 42 affected
 *   scramblingPct0_10     2 at ZERO
 *   fairwayPctNonDriver   2 at ZERO
 *   scramblingPct10_20    0 at zero
 *   fairwayPctDriver      0 at zero
 *
 * The 20-30 yard band is the live one, comparable in reach to the GIR-from-sand
 * case fixed in c8284af93 (6 zero + 14 thin). The two-player cases are smaller
 * but identical in kind, and are covered by the same builder.
 *
 * A REAL 0% stays undimmed throughout: eight scrambles from 20-30 yds and none
 * converted is a finding, not missing data.
 */
import { describe, it, expect } from 'vitest';
import { buildScramblingByDistanceRows } from '@/components/golf/stats/spine-stage/ShortGameDrill';
import { buildFairwayByHoleTypeRows } from '@/components/golf/stats/spine-stage/DrivingDrill';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';

function stats(over: Partial<GolfStats>): GolfStats {
  return over as unknown as GolfStats;
}

describe('ShortGameDrill — scrambling by distance does not invent a zero', () => {
  it('renders an em-dash for a band the player has never played from', () => {
    const row = buildScramblingByDistanceRows(
      stats({ scramblingPct0_10: 55, scramblingPct10_20: 40, scramblingPct20_30: null }),
    ).find((r) => r.label === '20-30 yds');

    expect(row?.value).toBe('—');
    expect(row?.dim).toBe(true);
    expect(row?.pct).toBe(0);
  });

  it('still renders a REAL 0% undimmed', () => {
    const row = buildScramblingByDistanceRows(stats({ scramblingPct20_30: 0 })).find(
      (r) => r.label === '20-30 yds',
    );

    expect(row?.value).toBe('0%');
    expect(row?.dim).toBeFalsy();
  });

  it('applies the rule to every band', () => {
    const rows = buildScramblingByDistanceRows(
      stats({ scramblingPct0_10: null, scramblingPct10_20: null, scramblingPct20_30: null }),
    );
    for (const r of rows) {
      expect(r.value, r.label).toBe('—');
      expect(r.dim, r.label).toBe(true);
    }
  });

  it('leaves real values alone', () => {
    const rows = buildScramblingByDistanceRows(
      stats({ scramblingPct0_10: 55, scramblingPct10_20: 40, scramblingPct20_30: 25 }),
    );
    expect(rows.map((r) => r.value)).toEqual(['55%', '40%', '25%']);
    expect(rows.every((r) => !r.dim)).toBe(true);
  });
});

describe('DrivingDrill — fairway by hole type / club does not invent a zero', () => {
  it('renders an em-dash for a club the player never tees off with', () => {
    const row = buildFairwayByHoleTypeRows(
      stats({ fairwayPctPar4: 60, fairwayPctPar5: 65, fairwayPctDriver: 58, fairwayPctNonDriver: null }),
    ).find((r) => r.label === 'Non-driver');

    expect(row?.value).toBe('—');
    expect(row?.dim).toBe(true);
  });

  it('still renders a REAL 0% undimmed', () => {
    const row = buildFairwayByHoleTypeRows(stats({ fairwayPctNonDriver: 0 })).find(
      (r) => r.label === 'Non-driver',
    );

    expect(row?.value).toBe('0%');
    expect(row?.dim).toBeFalsy();
  });

  it('keeps all four rows in order', () => {
    const rows = buildFairwayByHoleTypeRows(
      stats({ fairwayPctPar4: 60, fairwayPctPar5: 65, fairwayPctDriver: 58, fairwayPctNonDriver: 72 }),
    );
    expect(rows.map((r) => r.label)).toEqual(['Par 4', 'Par 5', 'Driver', 'Non-driver']);
    expect(rows.map((r) => r.value)).toEqual(['60%', '65%', '58%', '72%']);
  });
});
