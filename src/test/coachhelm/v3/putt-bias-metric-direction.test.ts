/**
 * `putt_miss_bias_left_pct` / `_right_pct` are declared `lower_better` in BOTH
 * direction tables, and the value stored under them is a MAKE percentage.
 * Higher is better. The direction is inverted.
 *
 * `PuttBiasGenerator` emits only the player's WEAKER break direction and writes
 * `your_value: agg.weak_pct`, documented at putt-bias.ts:62 as "Make-% on the
 * weaker direction within the cut". Its own evidence label says so too:
 * "Break-direction make % (distance-controlled)".
 *
 * The metric NAME says the opposite, and so do both tables:
 *
 *     standing/metric-config.ts   direction: 'lower_better',
 *                                 display_label: 'Putt Miss Left %'
 *     metrics/registry.ts:132-133 'lower_better'
 *
 * Measured against production 2026-08-18 — the make-rate signature is
 * unambiguous, because the generator's `comparison_value` is the SAME player's
 * make % on their stronger side:
 *
 *     rows where your_value < comparison_value   8
 *     rows where your_value > comparison_value   0
 *
 * A miss SHARE on the weaker side would be higher than the stronger side, not
 * lower. Every row goes the other way.
 *
 * WHAT IT COSTS TODAY. 31 active insights carry these metrics (26 left,
 * 5 right). `suggestGoalTarget` reads `cfg.direction` to decide whether a goal
 * target sits above or below the player's baseline, so a goal on this metric is
 * suggested in the wrong direction — asking a player to hole FEWER putts on the
 * side they already struggle with. `DiagnosisPanel.metricLabel` prefers the
 * config label, so it prints "Putt Miss Left %" over a make rate.
 *
 * The StandingBar and counterfactual paths read direction too but need a
 * `golf_player_standing` row, and these four metrics have none — latent there,
 * live in the two above.
 *
 * `putt_miss_bias_high_pct` / `_low_pct` are deliberately NOT touched.
 * `DIR_TO_METRIC_ID` maps only 'left' and 'right', so nothing produces them and
 * there is no evidence of what a value under them would mean. Guessing a
 * direction for a metric with no producer is how the first one went wrong.
 */
import { describe, it, expect } from 'vitest';
import { getMetricRenderConfig } from '@/lib/coachhelm/v3/standing/metric-config';
import { getMetricDirection } from '@/lib/coachhelm/v3/metrics/registry';

const PRODUCED = ['putt_miss_bias_left_pct', 'putt_miss_bias_right_pct'] as const;

describe('break-direction bias metrics are a MAKE rate', () => {
  for (const id of PRODUCED) {
    it(`${id} is higher_better in the render config`, () => {
      expect(getMetricRenderConfig(id)?.direction).toBe('higher_better');
    });

    it(`${id} is higher_better in the metric registry — the two must agree`, () => {
      expect(getMetricDirection(id)).toBe('higher_better');
    });

    it(`${id} is not labelled as a miss`, () => {
      // "Putt Miss Left %" over a make rate is the label a coach reads on the
      // diagnosis panel.
      expect(getMetricRenderConfig(id)?.display_label ?? '').not.toMatch(/miss/i);
    });

    it(`${id} is a percent on a 0-100 scale`, () => {
      const cfg = getMetricRenderConfig(id);
      expect(cfg?.unit).toBe('percent');
      expect(cfg!.default_scale.min).toBeGreaterThanOrEqual(0);
      expect(cfg!.default_scale.max).toBeLessThanOrEqual(100);
    });
  }

  it('leaves the unproduced high/low bias metrics alone', () => {
    // No generator maps to these — DIR_TO_METRIC_ID covers left/right only —
    // so there is no evidence of what a value under them would mean, and
    // guessing is what produced the inverted pair above.
    expect(getMetricDirection('putt_miss_bias_high_pct')).toBe('lower_better');
    expect(getMetricDirection('putt_miss_bias_low_pct')).toBe('lower_better');
  });

  it('keeps every other direction as it was', () => {
    // Guard: this fix must not become a sweep.
    expect(getMetricDirection('sg_total')).toBe('higher_better');
    expect(getMetricDirection('putts_made_3_5ft_pct')).toBe('higher_better');
    expect(getMetricDirection('approach_proximity_175_plus_ft')).toBe('lower_better');
    expect(getMetricDirection('penalty_rate_per_round')).toBe('lower_better');
    expect(getMetricDirection('scoring_par_4')).toBe('lower_better');
    expect(getMetricDirection('big_number_rate')).toBe('lower_better');
  });
});
