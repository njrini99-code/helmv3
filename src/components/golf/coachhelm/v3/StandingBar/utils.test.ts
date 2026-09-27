/**
 * utils.ts — Package 11 (#1933 bug, confirmed present on main, fixed here).
 * Card/Hero/Inline all call toScalePct/formatValue with no NaN guard
 * beforehand; a NaN input used to print the literal string "NaN%" and
 * drive a marker to `left: NaN%`.
 */
import { describe, expect, it } from 'vitest';

import {
  cohortComparisonText,
  deltaVsTeam,
  deriveAriaLabel,
  fitScale,
  formatValue,
  teamComparisonText,
  teamRelativeText,
  toScalePct,
} from './utils';

describe('toScalePct — NaN guard', () => {
  it('returns 0 instead of NaN for a NaN value', () => {
    expect(toScalePct(Number.NaN, { min: 0, max: 100 })).toBe(0);
  });

  it('still clamps ±Infinity to the rail edge (unchanged, pre-existing, correct behavior)', () => {
    // Math.max/Math.min already clamp a genuinely extreme value to 0/100 —
    // only NaN needed a guard, so this scoped fix must not touch Infinity.
    expect(toScalePct(Number.POSITIVE_INFINITY, { min: 0, max: 100 })).toBe(100);
    expect(toScalePct(Number.NEGATIVE_INFINITY, { min: 0, max: 100 })).toBe(0);
  });

  it('still computes normally for a finite value', () => {
    expect(toScalePct(50, { min: 0, max: 100 })).toBe(50);
  });
});

describe('formatValue — non-finite guard', () => {
  it('renders an em dash instead of "NaN%" for a NaN percent value', () => {
    expect(formatValue(Number.NaN, 'percent')).toBe('—');
  });

  it('renders an em dash instead of "NaNyd"/"Infinity yd" for a non-finite yards value', () => {
    expect(formatValue(Number.POSITIVE_INFINITY, 'yards')).toBe('—');
  });

  it('still formats normally for a finite value', () => {
    expect(formatValue(64.6, 'percent')).toBe('65%');
  });
});

describe('fitScale', () => {
  const sg = { min: -1.5, max: 1.5 };

  it('keeps the default scale when every value fits', () => {
    expect(fitScale(sg, [-0.8, 0.2, 0])).toBe(sg);
  });

  it('grows a zero-centred scale so an off-range value is not pinned to the edge', () => {
    const scale = fitScale(sg, [-2.93, -1.6, 0]);
    expect(scale).toEqual({ min: -3.5, max: 3.5 });
    const you = toScalePct(-2.93, scale);
    const team = toScalePct(-1.6, scale);
    expect(you).toBeGreaterThan(0);
    expect(team - you).toBeGreaterThan(15);
    expect(toScalePct(0, scale)).toBe(50);
  });

  it('pads a one-sided scale on the side that overflows', () => {
    const scale = fitScale({ min: 60, max: 100 }, [48, null, Number.NaN]);
    expect(scale.max).toBe(100);
    expect(scale.min).toBeLessThan(48);
  });
});

// Audit NUM-13: one sign convention across CoachHelm. The "vs team" pill's
// arrow, tone and caption must all derive from the same better/worse value,
// so a lower-is-better metric where the player beats the team reads
// "↑ … Above team average", never "↓ … Above team average".
describe('deltaVsTeam — arrow follows better/worse, not raw direction (NUM-13)', () => {
  it('points up for a lower-is-better metric where the player beats the team', () => {
    // Approach proximity 125-175 yd: you 37 ft vs team 45 ft (lower is better).
    expect(deltaVsTeam(37, 45, 'lower_better', 'feet')).toEqual({ arrow: '↑', tone: 'good' });
    expect(teamRelativeText(37, 45, 'lower_better', 'feet')).toBe('Above team average');
  });
  it('points down for a lower-is-better metric where the player trails the team', () => {
    expect(deltaVsTeam(0.8, 0.6, 'lower_better', 'count')).toEqual({ arrow: '↓', tone: 'bad' });
    expect(teamRelativeText(0.8, 0.6, 'lower_better', 'count')).toBe('Below team average');
  });
  it('agrees with the tone for every direction and side', () => {
    const cases: Array<[number, number, 'higher_better' | 'lower_better']> = [
      [42, 38, 'higher_better'],
      [35, 38, 'higher_better'],
      [0.4, 0.6, 'lower_better'],
      [0.8, 0.6, 'lower_better'],
    ];
    for (const [you, team, dir] of cases) {
      const d = deltaVsTeam(you, team, dir);
      expect(d.arrow).toBe(d.tone === 'good' ? '↑' : '↓');
    }
  });
});

// Stats › Standing: "Above team average" sat beside You 49 ft vs Team 72 ft.
// The opt-in direction-aware wording keeps the NUM-13 verdict (↑ = better)
// but never says "Above" next to the smaller number.
describe('teamComparisonText — direction-aware wording (opt-in)', () => {
  it('says "Closer than team average" for a proximity the player wins (lower is better, feet)', () => {
    expect(teamComparisonText(49, 72, 'lower_better', 'feet')).toBe('Closer than team average');
    expect(teamComparisonText(80, 72, 'lower_better', 'feet')).toBe('Farther than team average');
  });

  it('says "Better/Worse than team average" for other lower-is-better metrics', () => {
    expect(teamComparisonText(3.9, 4.2, 'lower_better', 'strokes')).toBe('Better than team average');
    expect(teamComparisonText(0.8, 0.6, 'lower_better', 'count')).toBe('Worse than team average');
  });

  it('keeps "Above/Below" on higher-is-better metrics, and the tie and no-team cases', () => {
    expect(teamComparisonText(42, 38, 'higher_better', 'percent')).toBe('Above team average');
    expect(teamComparisonText(35, 38, 'higher_better', 'percent')).toBe('Below team average');
    expect(teamComparisonText(64.6, 65.3, 'lower_better', 'percent')).toBe('Matches team average');
    expect(teamComparisonText(49, null, 'lower_better', 'feet')).toBe('');
  });

  it('agrees with the deltaVsTeam verdict for every direction and side', () => {
    const cases: Array<[number, number, 'higher_better' | 'lower_better', 'feet' | 'strokes']> = [
      [42, 38, 'higher_better', 'strokes'],
      [35, 38, 'higher_better', 'strokes'],
      [49, 72, 'lower_better', 'feet'],
      [80, 72, 'lower_better', 'feet'],
      [3.9, 4.2, 'lower_better', 'strokes'],
      [4.6, 4.2, 'lower_better', 'strokes'],
    ];
    for (const [you, team, dir, unit] of cases) {
      const good = deltaVsTeam(you, team, dir, unit).tone === 'good';
      expect(/^(Above|Better|Closer)/.test(teamComparisonText(you, team, dir, unit))).toBe(good);
    }
  });

  it('cohortComparisonText defaults to the NUM-13 "Above/Below" wording and switches only on opt-in', () => {
    const row = { player_value: 49, team_avg: 72, direction: 'lower_better' as const, unit: 'feet' as const };
    expect(cohortComparisonText(row)).toBe('Above team average');
    expect(cohortComparisonText({ ...row, cohort_wording: 'direction_aware' })).toBe('Closer than team average');
  });

  it('narrates the same wording in the aria label as the visible caption', () => {
    const label = deriveAriaLabel({
      metric_id: 'approach_proximity_175_plus_ft',
      metric_label: 'Approach Proximity 175+ yd',
      player_value: 49,
      team_avg: 72,
      team_n: 8,
      pga_value: 45,
      direction: 'lower_better',
      unit: 'feet',
      scale: { min: 35, max: 110 },
      size: 'card',
      cohort_wording: 'direction_aware',
    });
    expect(label).toContain('Closer than team average.');
    expect(label).not.toContain('Above team average');
  });
});
