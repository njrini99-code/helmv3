import { describe, it, expect } from 'vitest';
import {
  generateStatisticalStrengthsWeaknesses,
  type StatisticalStrengthWeakness,
} from '../strokes-gained';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';

/**
 * Regression cover for the 2026-07-25 strengths/weaknesses recalibration.
 *
 * The SG categories used to be graded against a hardcoded `0` benchmark — PGA
 * Tour scratch. Because college players are structurally negative against that
 * baseline (measured in prod: SG Approach negative for 30/30 players, SG Putting
 * for 29/30), every SG category surfaced as a weakness for nearly every player
 * and none could ever surface as a strength. The list did not discriminate.
 *
 * SG categories are now graded against the player's own average category SG.
 * These tests fail if anyone reinstates an absolute SG benchmark.
 */

/**
 * Minimal GolfStats fixture. Only the fields the SG path reads are meaningful;
 * everything else is nulled so no other candidate category competes for the
 * top-3 slots and pollutes the assertions.
 */
function makeStats(sg: {
  tee: number | null;
  approach: number | null;
  around: number | null;
  putting: number | null;
}): GolfStats {
  return {
    roundsPlayed: 10,
    sgTeePerRound: sg.tee,
    sgApproachPerRound: sg.approach,
    sgAroundGreenPerRound: sg.around,
    sgPuttingPerRound: sg.putting,
  } as unknown as GolfStats;
}

const find = (list: StatisticalStrengthWeakness[], label: string) =>
  list.find((x) => x.label === label);

describe('generateStatisticalStrengthsWeaknesses — SG is self-relative', () => {
  it('surfaces a strength even when every SG category is negative', () => {
    // A realistic college profile: all four categories below PGA scratch.
    // Under the old `0` benchmark this produced three weaknesses and ZERO
    // strengths. Off-the-tee is clearly this player's best category and must
    // now be reported as such.
    const { strengths, weaknesses } = generateStatisticalStrengthsWeaknesses(
      makeStats({ tee: -0.2, approach: -3.3, around: -0.5, putting: -2.9 }),
    );

    expect(strengths.length).toBeGreaterThan(0);
    const tee = find(strengths, 'SG: Off the Tee');
    expect(tee).toBeDefined();
    expect(tee!.strokeImpact).toBeGreaterThan(0);

    // ...and the genuine weak link is still identified.
    expect(find(weaknesses, 'SG: Approach')).toBeDefined();
  });

  it('grades each category against the mean of the four, not against zero', () => {
    // mean = (-1 + -2 + -3 + -4) / 4 = -2.5
    const { strengths, weaknesses } = generateStatisticalStrengthsWeaknesses(
      makeStats({ tee: -1, approach: -2, around: -3, putting: -4 }),
    );

    const tee = find(strengths, 'SG: Off the Tee');
    expect(tee?.benchmark).toBeCloseTo(-2.5, 5);
    expect(tee?.strokeImpact).toBeCloseTo(1.5, 5); // -1 - (-2.5)

    const putting = find(weaknesses, 'SG: Putting');
    expect(putting?.benchmark).toBeCloseTo(-2.5, 5);
    expect(putting?.strokeImpact).toBeCloseTo(-1.5, 5); // -4 - (-2.5)
  });

  it('labels the SG comparison as the player\'s own average, not a benchmark', () => {
    const { strengths, weaknesses } = generateStatisticalStrengthsWeaknesses(
      makeStats({ tee: 1, approach: -1, around: 0, putting: -2 }),
    );

    const sgRows = [...strengths, ...weaknesses].filter((r) =>
      r.label.startsWith('SG: '),
    );
    expect(sgRows.length).toBeGreaterThan(0);
    for (const row of sgRows) {
      expect(row.detail).toContain('your category average');
      expect(row.detail).not.toContain('benchmark:');
    }
  });

  it('is unaffected by overall level — a weaker player gets the same shape', () => {
    // Same relative spread, shifted down by 5 strokes/round (e.g. D3 vs D1).
    // Self-relative grading must produce identical impacts.
    const strong = generateStatisticalStrengthsWeaknesses(
      makeStats({ tee: 0, approach: -1, around: -2, putting: -3 }),
    );
    const weak = generateStatisticalStrengthsWeaknesses(
      makeStats({ tee: -5, approach: -6, around: -7, putting: -8 }),
    );

    expect(find(weak.strengths, 'SG: Off the Tee')?.strokeImpact).toBeCloseTo(
      find(strong.strengths, 'SG: Off the Tee')!.strokeImpact,
      5,
    );
    expect(find(weak.weaknesses, 'SG: Putting')?.strokeImpact).toBeCloseTo(
      find(strong.weaknesses, 'SG: Putting')!.strokeImpact,
      5,
    );
  });

  it('emits no SG candidates when fewer than two categories have data', () => {
    // One category is trivially equal to its own mean — impact zero, no signal.
    const { strengths, weaknesses } = generateStatisticalStrengthsWeaknesses(
      makeStats({ tee: -1.5, approach: null, around: null, putting: null }),
    );

    const sgRows = [...strengths, ...weaknesses].filter((r) =>
      r.label.startsWith('SG: '),
    );
    expect(sgRows).toHaveLength(0);
  });
});
