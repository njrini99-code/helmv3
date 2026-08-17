// @vitest-environment jsdom
/**
 * The Stats bento fabricates a 0% and hides every denominator.
 *
 * `golf-stats-calculator-shots.ts` is deliberately null-honest: it types
 * `sandSavePercentage: number | null` and returns null when there were no
 * attempts, precisely so "we have no data" and "you saved none" stay
 * distinguishable. `StatsBento` then throws that away:
 *
 *     { label: 'Sand saves', pct: finite(s?.sandSavePercentage) ?? 0,
 *       value: fmtPct(finite(s?.sandSavePercentage)) }
 *
 * A null becomes a bar at 0% — a player who has never been in a bunker renders
 * identically to one who has failed every save.
 *
 * The denominators are RIGHT THERE and unused. The same interface already
 * carries `sandSaveAttempts` / `sandSavesMade` and `scrambleAttempts` /
 * `scramblesMade`; none of them reach the screen.
 *
 * Measured in production 2026-08-17 across 42 players with completed rounds:
 *
 *   zero sand attempts  ->  1 player   renders a fabricated "0%"
 *   1-4 attempts        -> 14 players  a rate from <=4 tries, shown unqualified
 *   5+ attempts         -> 27 players
 *
 * A third of the roster shows a sand-save number derived from four or fewer
 * attempts, and nothing on screen says so — one save from two tries reads
 * "50%", the same visual weight as twenty from forty. That is the standing
 * complaint that round-filtered stats are "an undifferentiated blob… should be
 * each stat CATEGORY with its details and SAMPLE SIZE".
 *
 * `RampCell` in the same module family already carries an `n?` sample string,
 * so the convention exists; RailBarRow simply never adopted it.
 */
import { describe, it, expect } from 'vitest';
import { buildShortGameRows } from '@/components/golf/stats/spine-stage/StatsBento';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';

function stats(over: Partial<GolfStats>): GolfStats {
  return over as unknown as GolfStats;
}

describe('StatsBento short-game rows — sample honesty', () => {
  it('does not render a fabricated 0% when there were no attempts', () => {
    const rows = buildShortGameRows(
      stats({ sandSavePercentage: null, sandSaveAttempts: 0, sandSavesMade: 0 }),
    );
    const sand = rows.find((r) => r.label === 'Sand saves');

    // The honest rendering of "no attempts" is an em-dash, not a zero bar.
    expect(sand?.value).toBe('—');
    expect(sand?.pct).toBe(0);
    expect(sand?.dim).toBe(true);
  });

  it('still renders a real zero as 0%, distinct from no data', () => {
    // Attempted five, saved none. This IS 0% and must not be dimmed away.
    const rows = buildShortGameRows(
      stats({ sandSavePercentage: 0, sandSaveAttempts: 5, sandSavesMade: 0 }),
    );
    const sand = rows.find((r) => r.label === 'Sand saves');

    expect(sand?.value).toBe('0%');
    expect(sand?.dim).toBeFalsy();
  });

  it('carries the denominator so a rate from 2 tries cannot pass for one from 40', () => {
    const thin = buildShortGameRows(
      stats({ sandSavePercentage: 50, sandSaveAttempts: 2, sandSavesMade: 1 }),
    ).find((r) => r.label === 'Sand saves');
    const solid = buildShortGameRows(
      stats({ sandSavePercentage: 50, sandSaveAttempts: 40, sandSavesMade: 20 }),
    ).find((r) => r.label === 'Sand saves');

    expect(thin?.value).toBe('50%');
    expect(solid?.value).toBe('50%');
    // Same headline number, different evidence — the row must say which.
    expect(thin?.sample).toBe('1/2');
    expect(solid?.sample).toBe('20/40');
    expect(thin?.sample).not.toBe(solid?.sample);
  });

  it('does the same for scrambling, which has its own denominator', () => {
    const rows = buildShortGameRows(
      stats({ scramblingPercentage: 30, scrambleAttempts: 10, scramblesMade: 3 }),
    );
    const scr = rows.find((r) => r.label === 'Scrambling');

    expect(scr?.value).toBe('30%');
    expect(scr?.sample).toBe('3/10');
  });

  it('omits the sample rather than inventing one when counts are missing', () => {
    // A legacy/partial stats object with a rate but no counts must not render
    // "undefined/undefined" or a fabricated 0/0.
    const rows = buildShortGameRows(stats({ scramblingPercentage: 30 }));
    const scr = rows.find((r) => r.label === 'Scrambling');

    expect(scr?.value).toBe('30%');
    expect(scr?.sample).toBeUndefined();
  });
});
