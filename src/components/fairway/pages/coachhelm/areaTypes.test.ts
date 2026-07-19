import { describe, it, expect } from 'vitest';
import {
  getMetricCurrentValue,
  getAreaAutoFill,
  isLowerIsBetter,
  formatTargetMetricLabel,
  type AreaAutoFillStats,
} from './areaTypes';

const STATS: AreaAutoFillStats = {
  rounds_played: 12,
  avg_score: 74.2,
  avg_putts: 30.1,
  fairway_pct: 61.5,
  gir_pct: 58.0,
  best_score: 68,
  driving_distance: 268,
  proximity_to_hole: 34.5,
  scrambling_pct: 47.2,
  up_and_down_pct: 51.0,
  sand_save_pct: 38.0,
  one_putt_pct: 41.0,
  three_putt_pct: 6.5,
  par3_avg: 3.2,
  par4_avg: 4.1,
  par5_avg: 4.8,
};

describe('getMetricCurrentValue', () => {
  it('gates on recorded rounds — no rounds → no autofill', () => {
    expect(getMetricCurrentValue('Scoring Average', { ...STATS, rounds_played: 0 })).toBe('');
    expect(getMetricCurrentValue('Scoring Average', null)).toBe('');
    expect(getMetricCurrentValue('Scoring Average', undefined)).toBe('');
  });

  it('returns empty for an unknown / custom / empty metric', () => {
    expect(getMetricCurrentValue('', STATS)).toBe('');
    expect(getMetricCurrentValue('Custom Metric', STATS)).toBe('');
    expect(getMetricCurrentValue('Mental Toughness', STATS)).toBe('');
  });

  it('maps each suggested metric to the matching stat', () => {
    expect(getMetricCurrentValue('Driving Distance', STATS)).toBe('268');
    expect(getMetricCurrentValue('Fairways Hit %', STATS)).toBe('61.5');
    expect(getMetricCurrentValue('Fairway Accuracy', STATS)).toBe('61.5');
    expect(getMetricCurrentValue('GIR %', STATS)).toBe('58');
    expect(getMetricCurrentValue('Proximity to Hole', STATS)).toBe('34.5');
    expect(getMetricCurrentValue('Scrambling %', STATS)).toBe('47.2');
    expect(getMetricCurrentValue('Up & Down %', STATS)).toBe('51');
    expect(getMetricCurrentValue('Sand Save %', STATS)).toBe('38');
    expect(getMetricCurrentValue('Putts Per Round', STATS)).toBe('30.1');
    expect(getMetricCurrentValue('1-Putt %', STATS)).toBe('41');
    expect(getMetricCurrentValue('Scoring Average', STATS)).toBe('74.2');
    expect(getMetricCurrentValue('Par 3 Avg', STATS)).toBe('3.2');
    expect(getMetricCurrentValue('Par 5 Avg', STATS)).toBe('4.8');
  });

  it('does not mislabel a putt make-rate as putts-per-round', () => {
    // "Pressure Putts Made %" contains "putt" but is a make-rate we do not cache.
    expect(getMetricCurrentValue('Pressure Putts Made %', STATS)).toBe('');
  });

  it('leaves "3-Putt Avoidance %" blank (cache holds the rate, not avoidance)', () => {
    expect(getMetricCurrentValue('3-Putt Avoidance %', STATS)).toBe('');
    // The plain rate label still resolves.
    expect(getMetricCurrentValue('3-Putt %', STATS)).toBe('6.5');
  });

  it('returns empty when the matching stat is null (not tracked yet)', () => {
    expect(getMetricCurrentValue('Driving Distance', { ...STATS, driving_distance: null })).toBe('');
    expect(getMetricCurrentValue('Sand Save %', { ...STATS, sand_save_pct: null })).toBe('');
  });
});

describe('getAreaAutoFill', () => {
  it('keeps the suggested metric and its current value consistent (driving fix)', () => {
    // The legacy port labeled driving "Driving Distance" but filled fairway %.
    const fill = getAreaAutoFill('driving', STATS);
    expect(fill.suggestedMetric).toBe('Driving Distance');
    expect(fill.autoCurrentValue).toBe('268');
  });

  it('autofills short-game / scoring areas the legacy four-case map never did', () => {
    expect(getAreaAutoFill('short_game', STATS).autoCurrentValue).toBe('47.2'); // Scrambling %
    expect(getAreaAutoFill('course_management', STATS).autoCurrentValue).toBe('74.2'); // Scoring Average
    expect(getAreaAutoFill('putting', STATS).autoCurrentValue).toBe('30.1'); // Putts Per Round
    expect(getAreaAutoFill('iron_play', STATS).autoCurrentValue).toBe('58'); // GIR %
  });
});

describe('isLowerIsBetter — real direction lookup, not a naive keyword guess', () => {
  it('does NOT flag a v3 canonical putts-MADE metric as lower-is-better (mustFix regression)', () => {
    // putts_made_5_10ft_pct contains "putt" but is a make-rate: more is better.
    expect(isLowerIsBetter('putts_made_5_10ft_pct')).toBe(false);
    expect(isLowerIsBetter('putts_made_3_5ft_pct')).toBe(false);
    expect(isLowerIsBetter('putts_made_25_plus_ft_pct')).toBe(false);
  });

  it('still flags a genuine v3 lower-is-better metric', () => {
    expect(isLowerIsBetter('putt_miss_bias_high_pct')).toBe(true);
    expect(isLowerIsBetter('approach_proximity_50_125ft')).toBe(true);
    expect(isLowerIsBetter('scoring_par_3')).toBe(true);
  });

  it('resolves a v3 higher-is-better metric that is NOT keyword-flagged', () => {
    expect(isLowerIsBetter('gir_pct')).toBe(false);
    expect(isLowerIsBetter('sg_putting')).toBe(false);
  });

  it('falls back to the focus-area catalog for legacy display-label metrics', () => {
    expect(isLowerIsBetter('Putts Per Round')).toBe(true); // catalog: direction 'lower'
    expect(isLowerIsBetter('1-Putt %')).toBe(false); // catalog: direction 'higher'
    expect(isLowerIsBetter('3-Putt %')).toBe(true); // catalog: direction 'lower'
    expect(isLowerIsBetter('GIR %')).toBe(false); // catalog: direction 'higher'
  });

  it('guards the keyword-heuristic fallback against an unregistered make-rate phrasing', () => {
    // Not in either registry — the heuristic must not misread a "made"/"hit"
    // phrase as lower-is-better just because it contains "putt".
    expect(isLowerIsBetter('Pressure Putts Made %')).toBe(false);
    expect(isLowerIsBetter('Fairways Hit %ish')).toBe(false);
  });

  it('still uses the keyword heuristic for a genuinely unregistered lower-is-better metric', () => {
    expect(isLowerIsBetter('Custom Penalty Count')).toBe(true);
  });

  it('returns false for null/undefined/empty', () => {
    expect(isLowerIsBetter(null)).toBe(false);
    expect(isLowerIsBetter(undefined)).toBe(false);
    expect(isLowerIsBetter('')).toBe(false);
  });
});

describe('formatTargetMetricLabel — never leaks a raw snake_case key', () => {
  it('resolves a v3 canonical metric id to its display label', () => {
    expect(formatTargetMetricLabel('putts_made_5_10ft_pct')).toBe('Putts Made 5-10 ft');
  });

  it('resolves a focus-area catalog key to its display label', () => {
    expect(formatTargetMetricLabel('putts_per_round')).toBe('Putts Per Round');
  });

  it('passes a legacy catalog display label through unchanged', () => {
    expect(formatTargetMetricLabel('GIR %')).toBe('GIR %');
  });

  it('title-cases an unregistered snake_case metric rather than leaking it raw', () => {
    expect(formatTargetMetricLabel('custom_swing_tempo')).toBe('Custom Swing Tempo');
  });

  it('returns null for null/undefined/empty', () => {
    expect(formatTargetMetricLabel(null)).toBeNull();
    expect(formatTargetMetricLabel(undefined)).toBeNull();
    expect(formatTargetMetricLabel('')).toBeNull();
  });
});
