import { describe, it, expect } from 'vitest';
import {
  measuredStrokesImpact,
  missedGreenCost,
  rateGapStrokes,
  REFERENCE_MISSED_GREEN_COST,
} from './measured-impact';

describe('measuredStrokesImpact', () => {
  const base = {
    metric_id: 'putts_made_3_5ft_pct',
    direction: 'higher_better' as const,
    player_value: 80,
    pga_value: 90.5,
    player_30d_scoring_avg: null,
  };

  it('keeps a sub-0.3 measured impact the display counterfactual suppresses', () => {
    // 10.5 pp × 2 putts/round = 0.21 strokes: below the display floor, still measured.
    expect(measuredStrokesImpact({ ...base, player_attempts_per_round: 2 })).toBeCloseTo(0.21, 6);
  });

  it('never falls back to the per-pp tuning constant when no attempt rate is known', () => {
    expect(measuredStrokesImpact({ ...base, player_attempts_per_round: null })).toBe(0);
  });

  it('is 0 when the player is past the target', () => {
    expect(measuredStrokesImpact({ ...base, player_value: 95, player_attempts_per_round: 3 })).toBe(0);
  });

  it('gaps to a plausible cohort before the Tour', () => {
    // cohort 85 (plausible: >= 70 and below Tour) → 5 pp × 3 = 0.15
    expect(
      measuredStrokesImpact({ ...base, cohort_value: 85, player_attempts_per_round: 3 }),
    ).toBeCloseTo(0.15, 6);
  });
});

describe('rateGapStrokes', () => {
  it('multiplies attempts × gap × value and clamps to the ceiling', () => {
    expect(rateGapStrokes({ metricId: 'putt_miss_bias_left_pct', attemptsPerRound: 2, playerPct: 20, targetPct: 50, strokesPerEvent: 1 })).toBeCloseTo(0.6);
    expect(rateGapStrokes({ metricId: 'putt_miss_bias_left_pct', attemptsPerRound: 20, playerPct: 20, targetPct: 50, strokesPerEvent: 1 })).toBe(2.5);
    expect(rateGapStrokes({ metricId: 'x', attemptsPerRound: 2, playerPct: 60, targetPct: 50, strokesPerEvent: 1 })).toBe(0);
  });
});

describe('missedGreenCost', () => {
  const hit = { lie_after: 'green', distance_to_hole_after: 30, distance_unit_after: 'feet', is_penalty: false, on_green: true };
  const miss = { lie_after: 'sand', distance_to_hole_after: 20, distance_unit_after: 'yards', is_penalty: false, on_green: false };

  it('prices the player\'s own finishes with the expected-strokes table', () => {
    const c = missedGreenCost([hit, hit, hit, miss, miss, miss]);
    // E(sand, 20 yd) 2.53 − E(green, 30 ft) 1.98
    expect(c.source).toBe('player_finishes');
    expect(c.strokes).toBeCloseTo(0.55, 2);
  });

  it('adds the penalty stroke to a penalty miss', () => {
    const c = missedGreenCost([hit, hit, hit, miss, miss, { ...miss, is_penalty: true }]);
    expect(c.strokes).toBeCloseTo(0.55 + 1 / 3, 2);
  });

  it('falls back to the table reference with too few hits or misses', () => {
    expect(missedGreenCost([hit, miss])).toEqual({ strokes: REFERENCE_MISSED_GREEN_COST, source: 'reference' });
    expect(REFERENCE_MISSED_GREEN_COST).toBeCloseTo(0.61, 2);
  });
});
