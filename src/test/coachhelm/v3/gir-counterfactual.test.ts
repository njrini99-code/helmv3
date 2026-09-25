import { describe, it, expect } from 'vitest';
import { computeCounterfactual } from '@/lib/coachhelm/v3/counterfactual/compute';
import {
  GIR_MISSED_GREEN_YARDS,
  GIR_ON_GREEN_LEAVE_FEET,
  GIR_VALUE_PER_GREEN,
  getCounterfactualConfig,
} from '@/lib/coachhelm/v3/counterfactual/lookup-tables';
import { getExpectedStrokes } from '@/lib/utils/golf-stats-calculator-shots';
import { backfilledStrokesImpact, leveragePriorityFloor } from '@/lib/coachhelm/v3/engine/generator-base';

// GIR sizing (2026-09-25): the projection is attempt-rate only —
//   (gap_pp / 100) × GIR opportunities per round × strokes per green gained —
// with the per-green value read from the canonical expected-strokes table. With
// no player-own opportunity rate it is suppressed, unsized, instead of falling
// back to the old 0.09-strokes-per-pp constant (a fixed 18 holes × 0.5).

const GAP_INPUT = {
  metric_id: 'gir_pct',
  direction: 'higher_better' as const,
  player_value: 50,
  pga_value: 66,
  cohort_value: null,
  player_30d_scoring_avg: 76,
};

describe('GIR value per green gained', () => {
  it('is E(missed green, 20 yd fairway/fringe) − E(on green, 30 ft) from the canonical table', () => {
    const expected =
      getExpectedStrokes('fairway', GIR_MISSED_GREEN_YARDS) -
      getExpectedStrokes('green', 0, GIR_ON_GREEN_LEAVE_FEET);
    expect(GIR_VALUE_PER_GREEN).toBeCloseTo(expected, 2);
    expect(GIR_VALUE_PER_GREEN).toBeCloseTo(0.42, 2);
    expect(getCounterfactualConfig('gir_pct')!.value_per_unit).toBe(GIR_VALUE_PER_GREEN);
  });

  it('takes the conservative end of the greenside lies (sand and rough are worth more)', () => {
    const onGreen = getExpectedStrokes('green', 0, GIR_ON_GREEN_LEAVE_FEET);
    expect(getExpectedStrokes('sand', GIR_MISSED_GREEN_YARDS) - onGreen).toBeGreaterThan(GIR_VALUE_PER_GREEN);
    expect(getExpectedStrokes('rough', GIR_MISSED_GREEN_YARDS) - onGreen).toBeGreaterThan(GIR_VALUE_PER_GREEN);
  });
});

describe('GIR counterfactual — attempt-rate path', () => {
  it('sizes off the player\'s own GIR opportunities per round', () => {
    const p = computeCounterfactual({ ...GAP_INPUT, player_attempts_per_round: 18 });
    // 16pp × 18 opportunities = 2.88 greens a round × 0.42 = 1.21 strokes.
    expect(p.suppressed).toBe(false);
    expect(p.strokes_saved_per_round).toBeCloseTo(0.16 * 18 * GIR_VALUE_PER_GREEN, 5);
    expect(p.attempts_used).toBe(18);
  });

  it('a 9-hole-round player gets half the strokes of an 18-hole one at the same gap', () => {
    const p18 = computeCounterfactual({ ...GAP_INPUT, player_attempts_per_round: 18 });
    const p9 = computeCounterfactual({ ...GAP_INPUT, player_attempts_per_round: 9 });
    expect(p9.strokes_saved_per_round).toBeCloseTo(p18.strokes_saved_per_round / 2, 5);
  });
});

describe('GIR counterfactual — no player-own rate', () => {
  for (const rate of [undefined, null, 0, Number.NaN]) {
    it(`is suppressed and unsized when the rate is ${String(rate)}`, () => {
      const p = computeCounterfactual({ ...GAP_INPUT, player_attempts_per_round: rate });
      expect(p.suppressed).toBe(true);
      expect(p.suppress_reason).toBe('no_attempt_rate');
      expect(p.strokes_saved_per_round).toBe(0);
      expect(p.projected_score_if_closed).toBeNull();
    });
  }

  it('never reaches the old constant, even on a huge gap', () => {
    const p = computeCounterfactual({ ...GAP_INPUT, player_value: 0, pga_value: 100 });
    // Old path: 100pp × 0.09 = 9 → clamped 2.5 strokes a round.
    expect(p.strokes_saved_per_round).toBe(0);
    expect(p.suppressed).toBe(true);
  });

  it('adds no strokes_impact and no priority floor downstream', () => {
    const p = computeCounterfactual({ ...GAP_INPUT, player_value: 0, pga_value: 100 });
    expect(backfilledStrokesImpact(0, p, 'gir_pct')).toBe(0);
    expect(leveragePriorityFloor('low', p, 'gir_pct', 0.9)).toBe('low');
  });

  it('still reports no_gap first when the player is already past the target', () => {
    const p = computeCounterfactual({ ...GAP_INPUT, player_value: 70 });
    expect(p.suppress_reason).toBe('no_gap');
  });
});
