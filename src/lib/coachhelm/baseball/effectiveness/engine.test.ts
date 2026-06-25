import { describe, it, expect } from 'vitest';

import {
  measureObjectiveEffectiveness,
  rollupByFocusArea,
  EFFECTIVENESS_CALIBRATION,
  type EffectivenessMeasurementInput,
  type MeasurementPoint,
} from './engine';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const PRACTICE_DATE = '2026-04-01T15:00:00.000Z';
// "now" well after the after-window so reads are not 'too_early'.
const NOW = new Date('2026-05-15T00:00:00.000Z');

function dayOffset(base: string, days: number): string {
  return new Date(Date.parse(base) + days * 86_400_000).toISOString();
}

/** Build a session point for the k_rate metric — value is a 0..1 rate. */
function kRatePoint(days: number, value: number, scope: MeasurementPoint['scope'] = 'official_game'): MeasurementPoint {
  return { playerId: 'p1', date: dayOffset(PRACTICE_DATE, days), value, scope, weight: 5 };
}

function baseInput(over: Partial<EffectivenessMeasurementInput> = {}): EffectivenessMeasurementInput {
  return {
    teamId: 't1',
    practiceId: 'pr1',
    objectiveId: 'o1',
    focusArea: 'Two-strike approach',
    targetMetric: 'k_rate', // lower_better
    playerIds: ['p1'],
    practiceDate: PRACTICE_DATE,
    before: [],
    after: [],
    attendance: [{ playerId: 'p1', attended: true }],
    now: NOW,
    ...over,
  };
}

// -----------------------------------------------------------------------------

describe('measureObjectiveEffectiveness — honesty ladder', () => {
  it('reports not_tracked when the focus has no registry metric', () => {
    const r = measureObjectiveEffectiveness(
      baseInput({ targetMetric: 'vibes_unknown_metric' }),
    );
    expect(r.metricId).toBeNull();
    expect(r.direction).toBe('not_tracked');
    expect(r.confidence).toBeNull();
    expect(r.conclusion).toMatch(/no consistently-tracked metric/i);
  });

  it('reports too_early when no after-window data exists yet', () => {
    const r = measureObjectiveEffectiveness(
      baseInput({
        before: [kRatePoint(-5, 0.3), kRatePoint(-3, 0.3)],
        after: [],
      }),
    );
    expect(r.direction).toBe('too_early');
    expect(r.confidenceTier).toBe('too_early');
  });

  it('reports too_early when read happens within the minimum-days window', () => {
    // now is only 1 day after the practice (< MIN_DAYS_TO_READ_AFTER).
    const r = measureObjectiveEffectiveness(
      baseInput({
        before: [kRatePoint(-5, 0.3), kRatePoint(-3, 0.3)],
        after: [kRatePoint(0.5, 0.2)],
        now: new Date(Date.parse(PRACTICE_DATE) + 1 * 86_400_000),
      }),
    );
    expect(r.direction).toBe('too_early');
  });

  it('reports insufficient_sample when either side is too thin', () => {
    const r = measureObjectiveEffectiveness(
      baseInput({
        before: [kRatePoint(-5, 0.3)], // only 1 before
        after: [kRatePoint(5, 0.2), kRatePoint(7, 0.2)],
      }),
    );
    expect(r.direction).toBe('insufficient_sample');
    expect(r.confidenceTier).toBe('not_enough_sample');
  });
});

describe('measureObjectiveEffectiveness — direction discipline (registry sign)', () => {
  it('a DROP in a lower_better metric (k_rate) is an IMPROVEMENT', () => {
    const r = measureObjectiveEffectiveness(
      baseInput({
        before: [kRatePoint(-7, 0.32), kRatePoint(-5, 0.34), kRatePoint(-3, 0.33)],
        after: [kRatePoint(5, 0.22), kRatePoint(7, 0.2), kRatePoint(9, 0.21)],
      }),
    );
    expect(r.direction).toBe('improved');
    expect(r.confidenceTier).toBe('correlated_not_proven');
    expect(r.conclusion).toMatch(/associated with improvement|right direction/i);
  });

  it('a RISE in a lower_better metric (k_rate) is WORSE', () => {
    const r = measureObjectiveEffectiveness(
      baseInput({
        before: [kRatePoint(-7, 0.2), kRatePoint(-5, 0.21), kRatePoint(-3, 0.2)],
        after: [kRatePoint(5, 0.34), kRatePoint(7, 0.33), kRatePoint(9, 0.35)],
      }),
    );
    expect(r.direction).toBe('worse');
    expect(r.confidenceTier).toBe('correlated_not_proven');
  });

  it('movement within the stable band is stable / no_signal', () => {
    const r = measureObjectiveEffectiveness(
      baseInput({
        before: [kRatePoint(-7, 0.3), kRatePoint(-5, 0.3), kRatePoint(-3, 0.3)],
        after: [kRatePoint(5, 0.305), kRatePoint(7, 0.3), kRatePoint(9, 0.301)],
      }),
    );
    expect(r.direction).toBe('stable');
    expect(r.confidenceTier).toBe('no_signal');
  });
});

describe('measureObjectiveEffectiveness — NEVER a false high', () => {
  it('confidence is always capped below the correlation ceiling', () => {
    // Big, clean sample, full attendance — the most "confident" possible case.
    const before = Array.from({ length: 12 }, (_, i) => kRatePoint(-30 + i, 0.34));
    const after = Array.from({ length: 12 }, (_, i) => kRatePoint(2 + i, 0.18));
    const r = measureObjectiveEffectiveness(baseInput({ before, after }));
    expect(r.direction).toBe('improved');
    expect(r.confidence).not.toBeNull();
    expect(r.confidence!).toBeLessThanOrEqual(EFFECTIVENESS_CALIBRATION.CORRELATION_CONFIDENCE_CEILING);
    // The strongest honest tier is correlation — never "proven".
    expect(r.confidenceTier).toBe('correlated_not_proven');
  });
});

describe('measureObjectiveEffectiveness — confounders + scope labeling', () => {
  it('records an attendance gap when an assigned player did not attend', () => {
    const r = measureObjectiveEffectiveness(
      baseInput({
        playerIds: ['p1', 'p2'],
        before: [kRatePoint(-7, 0.32), kRatePoint(-5, 0.33)],
        after: [kRatePoint(5, 0.22), kRatePoint(7, 0.21)],
        attendance: [
          { playerId: 'p1', attended: true },
          { playerId: 'p2', attended: false },
        ],
      }),
    );
    expect(r.confounders.some((c) => c.code === 'attendance_gap')).toBe(true);
  });

  it('labels after_scope as mixed when scopes blend, and records a mixed_scope confounder', () => {
    const r = measureObjectiveEffectiveness(
      baseInput({
        before: [kRatePoint(-7, 0.32), kRatePoint(-5, 0.33)],
        after: [kRatePoint(5, 0.22, 'official_game'), kRatePoint(7, 0.21, 'scrimmage')],
      }),
    );
    expect(r.afterScope).toBe('mixed');
    expect(r.confounders.some((c) => c.code === 'mixed_scope')).toBe(true);
  });

  it('neutral_threshold metric is never scored as improvement', () => {
    const r = measureObjectiveEffectiveness(
      baseInput({
        focusArea: 'Pitch-count management',
        targetMetric: 'rolling_pitch_count', // neutral_threshold
        before: [{ playerId: 'p1', date: dayOffset(PRACTICE_DATE, -5), value: 120, scope: 'official_game', weight: 1 }, { playerId: 'p1', date: dayOffset(PRACTICE_DATE, -3), value: 110, scope: 'official_game', weight: 1 }],
        after: [{ playerId: 'p1', date: dayOffset(PRACTICE_DATE, 5), value: 60, scope: 'official_game', weight: 1 }, { playerId: 'p1', date: dayOffset(PRACTICE_DATE, 7), value: 55, scope: 'official_game', weight: 1 }],
      }),
    );
    // A big drop in pitch count is NOT "improvement" — neutral metric => stable.
    expect(r.direction).toBe('stable');
  });
});

describe('rollupByFocusArea', () => {
  it('only counts correlated reviews toward measured return', () => {
    const improved = measureObjectiveEffectiveness(
      baseInput({
        before: [kRatePoint(-7, 0.34), kRatePoint(-5, 0.33), kRatePoint(-3, 0.34)],
        after: [kRatePoint(5, 0.2), kRatePoint(7, 0.21), kRatePoint(9, 0.2)],
      }),
    );
    const tooEarly = measureObjectiveEffectiveness(
      baseInput({ before: [kRatePoint(-5, 0.3), kRatePoint(-3, 0.3)], after: [] }),
    );
    const roll = rollupByFocusArea([improved, tooEarly]);
    expect(roll).toHaveLength(1);
    expect(roll[0]!.improved).toBe(1);
    expect(roll[0]!.measured).toBe(1);
    expect(roll[0]!.unmeasured).toBe(1);
    expect(roll[0]!.positiveSignal).toBe(true);
  });
});
