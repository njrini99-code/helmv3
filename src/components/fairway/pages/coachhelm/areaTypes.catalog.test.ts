import { describe, it, expect } from 'vitest';

import {
  METRIC_CATALOG,
  metricsForArea,
  findMetric,
  readMetricValue,
  suggestTarget,
  formatMetricValue,
  isWindowableFocusMetric,
  aggregateFocusMetric,
  WINDOWABLE_FOCUS_METRIC_KEYS,
  type AreaAutoFillStats,
  type FocusWindowRound,
} from './areaTypes';

/** Minimal per-round row factory (only the fields a given metric reads matter). */
function round(partial: Partial<FocusWindowRound>): FocusWindowRound {
  return {
    round_date: '2026-06-01',
    total_score: null,
    total_putts: null,
    fairways_hit: null,
    fairways_total: null,
    greens_hit: null,
    greens_total: null,
    driving_distance_avg: null,
    scrambles_converted: null,
    scramble_attempts: null,
    sand_saves: null,
    sand_attempts: null,
    ...partial,
  };
}

const STATS: AreaAutoFillStats = {
  rounds_played: 12,
  avg_score: 75.3,
  avg_putts: 31.4,
  fairway_pct: 52,
  gir_pct: 48,
  driving_distance: 281,
  proximity_to_hole: 34.2,
  scrambling_pct: 41,
  up_and_down_pct: 45,
  sand_save_pct: 38,
  one_putt_pct: 39,
  three_putt_pct: 7,
  par3_avg: 3.21,
  par4_avg: 4.18,
  par5_avg: 4.92,
  best_score: 69,
};

describe('METRIC_CATALOG integrity', () => {
  it('has unique keys and labels', () => {
    expect(new Set(METRIC_CATALOG.map((m) => m.key)).size).toBe(METRIC_CATALOG.length);
    expect(new Set(METRIC_CATALOG.map((m) => m.label)).size).toBe(METRIC_CATALOG.length);
  });

  it('every entry can read its value from a full stats row', () => {
    for (const m of METRIC_CATALOG) {
      expect(m.read(STATS), `${m.key} reads`).not.toBeNull();
    }
  });

  it('groups by category', () => {
    expect(metricsForArea('driving').map((m) => m.key)).toEqual(['driving_distance', 'fairways_hit_pct']);
    expect(metricsForArea('putting').map((m) => m.key)).toContain('putts_per_round');
    expect(metricsForArea('mental_game')).toEqual([]); // no cached metrics → free-text only
  });
});

describe('findMetric', () => {
  it('resolves by stable key', () => {
    expect(findMetric('fairways_hit_pct')?.label).toBe('Fairways Hit %');
  });
  it('resolves by display label (case-insensitive) — back-compat with stored target_metric', () => {
    expect(findMetric('Fairways Hit %')?.key).toBe('fairways_hit_pct');
    expect(findMetric('gir %')?.key).toBe('gir_pct');
  });
  it('returns null for custom/unknown metrics', () => {
    expect(findMetric('Mental toughness')).toBeNull();
    expect(findMetric('')).toBeNull();
    expect(findMetric(null)).toBeNull();
  });
});

describe('readMetricValue', () => {
  it('returns the rounded current value from cached stats', () => {
    expect(readMetricValue('fairways_hit_pct', STATS)).toBe(52);
    expect(readMetricValue('Proximity to Hole', STATS)).toBe(34.2);
    expect(readMetricValue('par4_avg', STATS)).toBe(4.18);
  });
  it('returns null when the player has no rounds (never fabricated)', () => {
    expect(readMetricValue('fairways_hit_pct', { ...STATS, rounds_played: 0 })).toBeNull();
  });
  it('returns null for an untracked/custom metric', () => {
    expect(readMetricValue('Mental toughness', STATS)).toBeNull();
  });
});

describe('suggestTarget', () => {
  it('higher-is-better adds the step and clamps to max', () => {
    expect(suggestTarget('fairways_hit_pct', 52)).toBe(57); // +5
    expect(suggestTarget('gir_pct', 98)).toBe(100); // clamp 100
    expect(suggestTarget('driving_distance', 281)).toBe(289); // +8 yds
  });
  it('lower-is-better subtracts the step and clamps to min', () => {
    expect(suggestTarget('putts_per_round', 31.4)).toBe(30.4); // -1
    expect(suggestTarget('scoring_average', 75.3)).toBe(74.3); // -1
    expect(suggestTarget('three_putt_pct', 1)).toBe(0); // clamp 0, not negative
    expect(suggestTarget('par4_avg', 4.18)).toBe(4.08); // -0.1, 2dp
  });
  it('returns null with no current value or unknown metric', () => {
    expect(suggestTarget('fairways_hit_pct', null)).toBeNull();
    expect(suggestTarget('Mental toughness', 50)).toBeNull();
  });
});

describe('formatMetricValue', () => {
  it('formats with the right unit', () => {
    expect(formatMetricValue('fairways_hit_pct', 52)).toBe('52%');
    expect(formatMetricValue('driving_distance', 281)).toBe('281 yds');
    expect(formatMetricValue('proximity', 34.2)).toBe('34.2 ft');
    expect(formatMetricValue('putts_per_round', 31)).toBe('31 putts');
    expect(formatMetricValue('scoring_average', 75)).toBe('75');
  });
  it('shows an em dash for missing values', () => {
    expect(formatMetricValue('fairways_hit_pct', null)).toBe('—');
  });
});

describe('isWindowableFocusMetric', () => {
  it('is true for every windowable key (and its label)', () => {
    for (const key of WINDOWABLE_FOCUS_METRIC_KEYS) {
      expect(isWindowableFocusMetric(key), key).toBe(true);
    }
    // resolves a stored display label too
    expect(isWindowableFocusMetric('Fairways Hit %')).toBe(true);
    expect(isWindowableFocusMetric('Scoring Average')).toBe(true);
  });
  it('is false for metrics with no clean per-round source', () => {
    expect(isWindowableFocusMetric('proximity')).toBe(false);
    expect(isWindowableFocusMetric('up_and_down_pct')).toBe(false);
    expect(isWindowableFocusMetric('one_putt_pct')).toBe(false);
    expect(isWindowableFocusMetric('three_putt_pct')).toBe(false);
    expect(isWindowableFocusMetric('par3_avg')).toBe(false);
  });
  it('is false for custom/unknown/empty', () => {
    expect(isWindowableFocusMetric('Mental toughness')).toBe(false);
    expect(isWindowableFocusMetric(null)).toBe(false);
    expect(isWindowableFocusMetric('')).toBe(false);
  });
});

describe('aggregateFocusMetric', () => {
  it('averages per-round figures (distance, score, putts)', () => {
    const rounds = [
      round({ driving_distance_avg: 280, total_score: 74, total_putts: 30 }),
      round({ driving_distance_avg: 290, total_score: 76, total_putts: 32 }),
    ];
    expect(aggregateFocusMetric('driving_distance', rounds)).toBe(285);
    expect(aggregateFocusMetric('scoring_average', rounds)).toBe(75);
    expect(aggregateFocusMetric('putts_per_round', rounds)).toBe(31);
  });

  it('pools numerator/denominator for rate stats', () => {
    const rounds = [
      round({ fairways_hit: 7, fairways_total: 14, greens_hit: 9, greens_total: 18 }),
      round({ fairways_hit: 8, fairways_total: 14, greens_hit: 12, greens_total: 18 }),
    ];
    // (7+8)/(14+14) = 15/28 = 53.57…%
    expect(aggregateFocusMetric('fairways_hit_pct', rounds)).toBeCloseTo(53.571, 2);
    // (9+12)/(18+18) = 21/36 = 58.33…%
    expect(aggregateFocusMetric('gir_pct', rounds)).toBeCloseTo(58.333, 2);
  });

  it('pools scrambling + sand saves', () => {
    const rounds = [
      round({ scrambles_converted: 3, scramble_attempts: 6, sand_saves: 1, sand_attempts: 2 }),
      round({ scrambles_converted: 2, scramble_attempts: 4, sand_saves: 2, sand_attempts: 4 }),
    ];
    // (3+2)/(6+4) = 50%
    expect(aggregateFocusMetric('scrambling_pct', rounds)).toBe(50);
    // (1+2)/(2+4) = 50%
    expect(aggregateFocusMetric('sand_save_pct', rounds)).toBe(50);
  });

  it('resolves a stored display label, not just the key', () => {
    const rounds = [round({ total_score: 70 }), round({ total_score: 72 })];
    expect(aggregateFocusMetric('Scoring Average', rounds)).toBe(71);
  });

  it('returns null for non-windowable / unknown metrics and empty rounds', () => {
    const rounds = [round({ total_score: 70 })];
    expect(aggregateFocusMetric('proximity', rounds)).toBeNull(); // not windowable
    expect(aggregateFocusMetric('Mental toughness', rounds)).toBeNull(); // unknown
    expect(aggregateFocusMetric('scoring_average', [])).toBeNull(); // no rounds
  });

  it('returns null when a rate metric has a zero denominator (no fabrication)', () => {
    const rounds = [round({ fairways_hit: 0, fairways_total: 0 })];
    expect(aggregateFocusMetric('fairways_hit_pct', rounds)).toBeNull();
  });
});
