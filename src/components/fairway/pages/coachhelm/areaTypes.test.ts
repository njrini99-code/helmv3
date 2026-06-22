import { describe, it, expect } from 'vitest';
import {
  getMetricCurrentValue,
  getAreaAutoFill,
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
