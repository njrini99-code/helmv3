/**
 * #1266 — the write-time directional guard on focus-area targets.
 *
 * A focus area could be saved with a target that asks the player to get WORSE
 * and the card rendered "100% there" for it. Live example: `fairways_hit_pct`
 * (unambiguously higher-is-better), baseline 82, current 86, target 66.
 *
 * It cannot be caught at display time. `getProgressPercent` returns 100 as
 * soon as the target is met, deliberately and BEFORE its span guards, because
 * a baseline stamped after the player had already passed the target (the
 * driver's self-heal on a pre-existing area) is a satisfied objective, not bad
 * data. Both cases are then numerically identical — `baseline > target` on a
 * higher-is-better metric — so the only place they can be told apart is the
 * write, where the target is being set against the baseline in front of you.
 */
import { describe, it, expect } from 'vitest';
import { describeWrongWayTarget, resolveMetricDirection } from './direction';

describe('describeWrongWayTarget — rejects a target pointing the wrong way', () => {
  it('rejects the exact row from #1266 (fairways_hit_pct 82 → 66)', () => {
    expect(resolveMetricDirection('fairways_hit_pct')).toBe('higher');
    const reason = describeWrongWayTarget({
      targetMetric: 'fairways_hit_pct',
      baselineValue: 82,
      targetValue: 66,
      metricLabel: 'Fairways Hit %',
    });
    expect(reason).toBeTruthy();
    expect(reason).toContain('better when higher');
    expect(reason).toContain('66');
    expect(reason).toContain('82');
  });

  it('accepts an improving target on a higher-is-better metric', () => {
    expect(
      describeWrongWayTarget({ targetMetric: 'fairways_hit_pct', baselineValue: 82, targetValue: 88 }),
    ).toBeNull();
  });

  it('rejects a target that RAISES a lower-is-better metric', () => {
    expect(resolveMetricDirection('approach_proximity_50_125ft')).toBe('lower');
    const reason = describeWrongWayTarget({
      targetMetric: 'approach_proximity_50_125ft',
      baselineValue: 28,
      targetValue: 34,
    });
    expect(reason).toContain('better when lower');
  });

  it('accepts the sibling row #1266 verified as correct (proximity 28 → 18)', () => {
    expect(
      describeWrongWayTarget({
        targetMetric: 'approach_proximity_50_125ft',
        baselineValue: 28,
        targetValue: 18,
      }),
    ).toBeNull();
  });

  it('allows an unknown direction rather than guessing', () => {
    // Consistent with getProgressPercent, which renders NO bar for unknown
    // instead of assuming higher-is-better. Blocking here would forbid the
    // custom free-text metrics an "Other" focus area is allowed to use.
    expect(resolveMetricDirection('coach_vibes')).toBe('unknown');
    expect(
      describeWrongWayTarget({ targetMetric: 'coach_vibes', baselineValue: 10, targetValue: 1 }),
    ).toBeNull();
  });

  it('allows a hold-the-line target equal to the baseline', () => {
    // Maintaining a number is a real coaching intent, not a typo. Only a
    // target strictly on the wrong side is refused.
    expect(
      describeWrongWayTarget({ targetMetric: 'fairways_hit_pct', baselineValue: 82, targetValue: 82 }),
    ).toBeNull();
  });

  it('allows a missing baseline or target', () => {
    // A focus area may legitimately exist before either is known, and the
    // from-review / from-insight create paths write a target with no baseline.
    expect(
      describeWrongWayTarget({ targetMetric: 'fairways_hit_pct', baselineValue: null, targetValue: 66 }),
    ).toBeNull();
    expect(
      describeWrongWayTarget({ targetMetric: 'fairways_hit_pct', baselineValue: 82, targetValue: null }),
    ).toBeNull();
  });

  it('does not choke on non-finite values', () => {
    expect(
      describeWrongWayTarget({ targetMetric: 'fairways_hit_pct', baselineValue: NaN, targetValue: 66 }),
    ).toBeNull();
  });
});
