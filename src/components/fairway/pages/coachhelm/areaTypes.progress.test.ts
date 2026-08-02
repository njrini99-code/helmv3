/**
 * Focus-area progress semantics — the two defects found by driving the real
 * coach→player loop on 2026-08-02 (#1242, #1240).
 *
 * #1242: direction resolution defaulted to higher-is-better whenever a metric
 *        matched neither registry, so a LOWER-is-better area rendered a FULLER
 *        bar the further the player was from target — "Avg proximity 80-120y"
 *        at 28 ft against an 18 ft target displayed "100% there".
 *
 * #1240: progress was `current / target` — a ratio of absolute values, not
 *        travel along the journey — so a brand-new 61 → 66 area opened at
 *        "92% there" and the entire objective moved the bar 8 points.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveMetricDirection,
  isLowerIsBetter,
  getProgressPercent,
} from './areaTypes';

describe('resolveMetricDirection (#1242)', () => {
  it('resolves from the v3 registry first', () => {
    expect(resolveMetricDirection('approach_proximity_50_125ft')).toBe('lower');
    expect(resolveMetricDirection('scoring_par_3')).toBe('lower');
    expect(resolveMetricDirection('putts_made_5_10ft_pct')).toBe('higher');
    expect(resolveMetricDirection('gir_pct')).toBe('higher');
  });

  it('falls back to the focus-area catalog by key or label', () => {
    expect(resolveMetricDirection('Putts Per Round')).toBe('lower');
    expect(resolveMetricDirection('3-Putt %')).toBe('lower');
    expect(resolveMetricDirection('1-Putt %')).toBe('higher');
    expect(resolveMetricDirection('fairways_hit_pct')).toBe('higher');
  });

  it('recognizes proximity/distance phrasing the keyword list used to miss', () => {
    // The exact live values that rendered an inverted bar.
    expect(resolveMetricDirection('Avg proximity 80-120y')).toBe('lower');
    expect(resolveMetricDirection('avg_proximity_ft')).toBe('lower');
    expect(resolveMetricDirection('dispersion_yds')).toBe('lower');
  });

  it('keeps make-rate phrasing higher-is-better despite a lower-is-better keyword', () => {
    expect(resolveMetricDirection('Pressure Putts Made %')).toBe('higher');
    expect(resolveMetricDirection('Fairways Hit %ish')).toBe('higher');
  });

  it('returns "unknown" rather than guessing higher-is-better', () => {
    // The bug: anything unrecognized silently became higher-is-better.
    expect(resolveMetricDirection('Mental Toughness')).toBe('unknown');
    expect(resolveMetricDirection('three_putt_chain')).toBe('lower'); // 'putt' keyword
    expect(resolveMetricDirection('coach_vibes')).toBe('unknown');
    expect(resolveMetricDirection(null)).toBe('unknown');
    expect(resolveMetricDirection('')).toBe('unknown');
  });

  it('keeps isLowerIsBetter back-compatible', () => {
    expect(isLowerIsBetter('Putts Per Round')).toBe(true);
    expect(isLowerIsBetter('gir_pct')).toBe(false);
    expect(isLowerIsBetter('Mental Toughness')).toBe(false); // unknown is not "lower"
    expect(isLowerIsBetter(null)).toBe(false);
  });
});

describe('getProgressPercent — baseline-relative (#1240)', () => {
  it('is 0 at the baseline, not current/target', () => {
    // The live repro: prescribed at 61 toward 66 read "92% there" on day zero.
    expect(getProgressPercent(61, 66, 'fairways_hit_pct', 61)).toBe(0);
  });

  it('measures travel from baseline to target', () => {
    expect(getProgressPercent(63.5, 66, 'fairways_hit_pct', 61)).toBe(50);
    expect(getProgressPercent(66, 66, 'fairways_hit_pct', 61)).toBe(100);
  });

  it('clamps overshoot to 100 and regression to 0', () => {
    expect(getProgressPercent(82, 66, 'fairways_hit_pct', 61)).toBe(100);
    expect(getProgressPercent(55, 66, 'fairways_hit_pct', 61)).toBe(0);
  });

  it('handles lower-is-better in the same baseline-relative terms', () => {
    // 28 ft baseline, 18 ft target, now 23 ft → half way there.
    expect(getProgressPercent(23, 18, 'Avg proximity 80-120y', 28)).toBe(50);
    expect(getProgressPercent(18, 18, 'Avg proximity 80-120y', 28)).toBe(100);
    expect(getProgressPercent(28, 18, 'Avg proximity 80-120y', 28)).toBe(0);
    // Worse than where they started.
    expect(getProgressPercent(31, 18, 'Avg proximity 80-120y', 28)).toBe(0);
  });

  it('NEVER reports progress for a player who is further from target than baseline', () => {
    // #1242's live case, now with a baseline: 28 ft vs an 18 ft target is 0%,
    // not the "100% there" the ratio formula produced.
    expect(getProgressPercent(28, 18, 'Avg proximity 80-120y', 28)).not.toBe(100);
  });

  it('returns null (render no bar) when direction cannot be resolved', () => {
    expect(getProgressPercent(28, 18, 'coach_vibes', 30)).toBeNull();
    expect(getProgressPercent(5, 10, null, 1)).toBeNull();
  });

  it('returns null (render no bar) when there is no baseline to measure from', () => {
    expect(getProgressPercent(28, 18, 'Avg proximity 80-120y', null)).toBeNull();
    expect(getProgressPercent(61, 66, 'fairways_hit_pct', undefined)).toBeNull();
  });

  it('reports 100 when the target is met, whatever the baseline says', () => {
    // Reaching the target IS done. This also covers the baseline the driver
    // self-heals onto a pre-existing area that had already passed its target,
    // which puts target on the "wrong" side of baseline — a satisfied
    // objective, not bad data, so it must not degrade to no-bar.
    expect(getProgressPercent(66, 66, 'fairways_hit_pct', 66)).toBe(100);
    expect(getProgressPercent(82, 66, 'fairways_hit_pct', 82)).toBe(100);
    expect(getProgressPercent(15, 18, 'Avg proximity 80-120y', 15)).toBe(100);
  });

  it('returns null when baseline equals target and the target is NOT met', () => {
    expect(getProgressPercent(60, 66, 'fairways_hit_pct', 66)).toBeNull();
  });

  it('returns null on missing current/target rather than a misleading 0', () => {
    expect(getProgressPercent(null, 66, 'fairways_hit_pct', 61)).toBeNull();
    expect(getProgressPercent(61, null, 'fairways_hit_pct', 61)).toBeNull();
  });
});
