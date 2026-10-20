import { describe, it, expect } from 'vitest';
import {
  checkGoalMetric,
  checkGoalTarget,
  preStartBaseline,
  preStartRounds,
} from '../goal-rules';
import type { WindowRound } from '../window-metric';

function round(date: string, sgPutting: number | null, penalties = 0): WindowRound {
  return {
    round_date: date,
    strokes_gained_total: null,
    strokes_gained_putting: sgPutting,
    strokes_gained_tee: null,
    strokes_gained_approach: null,
    strokes_gained_around_green: null,
    greens_hit: null,
    greens_total: null,
    sand_saves: null,
    sand_attempts: null,
    penalty_strokes: penalties,
  };
}

describe('checkGoalMetric', () => {
  it('refuses metrics whose progress would read the all-time standing', () => {
    expect(checkGoalMetric('scoring_par_4')).toBe('metric_not_windowed');
    expect(checkGoalMetric('putts_made_5_10ft_pct')).toBe('metric_not_windowed');
    expect(checkGoalMetric('approach_proximity_50_125ft')).toBe('metric_not_windowed');
  });
  it('allows windowed metrics', () => {
    expect(checkGoalMetric('sg_putting')).toBeNull();
    expect(checkGoalMetric('penalty_rate_per_round')).toBeNull();
  });
});

describe('checkGoalTarget', () => {
  it('rejects a lower-is-better target that is worse than the baseline (achieved by construction)', () => {
    // The live case: proximity target 19.0 ft against a measured 18.72 ft.
    expect(checkGoalTarget({ baseline: 18.72, target: 19, direction: 'lower_better' })).toBe(
      'target_not_better_than_baseline',
    );
  });
  it('rejects a target equal to the baseline', () => {
    expect(checkGoalTarget({ baseline: -2, target: -2, direction: 'higher_better' })).toBe(
      'target_not_better_than_baseline',
    );
  });
  it('accepts a target on the improving side', () => {
    expect(checkGoalTarget({ baseline: -2.8, target: -1.5, direction: 'higher_better' })).toBeNull();
    expect(checkGoalTarget({ baseline: 0.8, target: 0.5, direction: 'lower_better' })).toBeNull();
  });
  it('has nothing to check without a baseline', () => {
    expect(checkGoalTarget({ baseline: null, target: 1, direction: 'higher_better' })).toBeNull();
  });
});

describe('preStartBaseline', () => {
  const rounds = [
    round('2026-05-01', -9), // older than 90 days before start: excluded
    round('2026-07-10', -3),
    round('2026-08-20', -2),
    round('2026-09-01', -8), // on/after start: excluded
  ];

  it('averages only the rounds in the 90 days before the start', () => {
    expect(preStartRounds(rounds, '2026-09-01T15:00:00Z').map((r) => r.round_date)).toEqual([
      '2026-07-10',
      '2026-08-20',
    ]);
    expect(preStartBaseline('sg_putting', rounds, '2026-09-01T15:00:00Z')).toBeCloseTo(-2.5, 6);
  });

  it('is null when the player has no rounds before the start', () => {
    expect(preStartBaseline('sg_putting', [round('2026-09-02', -1)], '2026-09-01T00:00:00Z')).toBeNull();
  });

  it('is null for a metric that is not windowed', () => {
    expect(preStartBaseline('scoring_par_4', rounds, '2026-09-01T00:00:00Z')).toBeNull();
  });
});
