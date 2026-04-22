/**
 * Strokes Gained Benchmark Configuration
 *
 * Multiple benchmark levels for SG calculations:
 * - PGA Tour: Professional level (Shotlink data)
 * - Scratch: 0-handicap golfer
 * - NCAA D1: Division 1 college player (~+2 handicap)
 * - NCAA D2: Division 2 college player (~+5 handicap)
 * - NCAA D3: Division 3 college player (~+8 handicap)
 * - Break 80: ~10 handicap golfer
 * - Break 90: ~18 handicap golfer
 * - Break 100: ~28 handicap golfer
 *
 * Each benchmark set follows the BaselineData format:
 * Record<LieType, Record<distance, expectedStrokes>>
 *
 * Distances:
 * - tee/fairway/rough/sand: yards
 * - green: feet
 */

import type { BaselineData, LieType } from './strokes-gained';

// ============================================================================
// BENCHMARK LEVEL TYPE
// ============================================================================

export type BenchmarkLevel =
  | 'pga_tour'
  | 'scratch'
  | 'ncaa_d1'
  | 'ncaa_d2'
  | 'ncaa_d3'
  | 'break_80'
  | 'break_90'
  | 'break_100';

interface BenchmarkMeta {
  id: BenchmarkLevel;
  label: string;
  shortLabel: string;
  description: string;
  /** Approximate handicap for this level */
  approximateHandicap: number;
  /** Approximate scoring average (18 holes, par 72) */
  approximateScoringAvg: number;
}

// ============================================================================
// BENCHMARK METADATA
// ============================================================================

export const BENCHMARK_METADATA: Record<BenchmarkLevel, BenchmarkMeta> = {
  pga_tour: {
    id: 'pga_tour',
    label: 'PGA Tour',
    shortLabel: 'PGA',
    description: 'Professional golfer (Shotlink data)',
    approximateHandicap: -4,
    approximateScoringAvg: 70,
  },
  scratch: {
    id: 'scratch',
    label: 'Scratch Golfer',
    shortLabel: 'Scratch',
    description: '0-handicap golfer',
    approximateHandicap: 0,
    approximateScoringAvg: 72,
  },
  ncaa_d1: {
    id: 'ncaa_d1',
    label: 'NCAA Division I',
    shortLabel: 'D1',
    description: 'Division I college golfer (~+2)',
    approximateHandicap: 2,
    approximateScoringAvg: 74,
  },
  ncaa_d2: {
    id: 'ncaa_d2',
    label: 'NCAA Division II',
    shortLabel: 'D2',
    description: 'Division II college golfer (~+5)',
    approximateHandicap: 5,
    approximateScoringAvg: 77,
  },
  ncaa_d3: {
    id: 'ncaa_d3',
    label: 'NCAA Division III',
    shortLabel: 'D3',
    description: 'Division III college golfer (~+8)',
    approximateHandicap: 8,
    approximateScoringAvg: 80,
  },
  break_80: {
    id: 'break_80',
    label: 'Break 80',
    shortLabel: '< 80',
    description: 'Single-digit handicap (~10)',
    approximateHandicap: 10,
    approximateScoringAvg: 82,
  },
  break_90: {
    id: 'break_90',
    label: 'Break 90',
    shortLabel: '< 90',
    description: 'Mid-handicap golfer (~18)',
    approximateHandicap: 18,
    approximateScoringAvg: 90,
  },
  break_100: {
    id: 'break_100',
    label: 'Break 100',
    shortLabel: '< 100',
    description: 'Higher-handicap golfer (~28)',
    approximateHandicap: 28,
    approximateScoringAvg: 100,
  },
};

// ============================================================================
// ORDERED BENCHMARK LIST (for UI selectors)
// ============================================================================

export const BENCHMARK_LEVELS: BenchmarkLevel[] = [
  'pga_tour',
  'scratch',
  'ncaa_d1',
  'ncaa_d2',
  'ncaa_d3',
  'break_80',
  'break_90',
  'break_100',
];

// ============================================================================
// BASELINE DATA SETS
// ============================================================================

/**
 * Scale PGA Tour baseline data to a different skill level.
 *
 * Logic: A weaker golfer takes more expected strokes from any position.
 * The scale factor is derived from the ratio of their scoring average to PGA Tour average.
 *
 * - From longer distances, the penalty grows proportionally
 * - From the green, the penalty is smaller (putting is more universal)
 * - Sand has amplified penalties for weaker players
 */
function scaleBaseline(pgaData: BaselineData, scaleFactor: number, puttingScale: number): BaselineData {
  const scaled: Partial<Record<LieType, Record<number, number>>> = {};

  for (const [lie, distances] of Object.entries(pgaData) as [LieType, Record<number, number>][]) {
    const isGreen = lie === 'green';
    const isSand = lie === 'sand';
    const factor = isGreen ? puttingScale : isSand ? scaleFactor * 1.1 : scaleFactor;

    const scaledDistances: Record<number, number> = {};
    for (const [dist, strokes] of Object.entries(distances)) {
      scaledDistances[Number(dist)] = Math.round(strokes * factor * 100) / 100;
    }
    scaled[lie] = scaledDistances;
  }

  return scaled as BaselineData;
}

// PGA Tour baseline (canonical data — imported from strokes-gained.ts)
const PGA_TOUR_BASELINE: BaselineData = {
  tee: {
    600: 4.90, 580: 4.85, 560: 4.80, 540: 4.75, 520: 4.70,
    500: 4.65, 480: 4.60, 460: 4.55, 440: 4.50, 420: 4.45,
    400: 4.10, 380: 4.02, 360: 3.95, 340: 3.88, 320: 3.82,
    300: 3.75, 280: 3.68, 260: 3.62,
  },
  fairway: {
    275: 3.45, 250: 3.30, 225: 3.15, 200: 2.99, 190: 2.92,
    180: 2.86, 175: 2.82, 170: 2.78, 165: 2.75, 160: 2.71,
    155: 2.68, 150: 2.67, 145: 2.64, 140: 2.61, 135: 2.58,
    130: 2.55, 125: 2.53, 120: 2.50, 115: 2.47, 110: 2.44,
    105: 2.42, 100: 2.40, 95: 2.37, 90: 2.35, 85: 2.32,
    80: 2.30, 75: 2.27, 70: 2.25, 65: 2.22, 60: 2.20,
    55: 2.17, 50: 2.15, 45: 2.12, 40: 2.10, 35: 2.08,
    30: 2.06, 25: 2.04, 20: 2.02,
  },
  rough: {
    275: 3.65, 250: 3.48, 225: 3.32, 200: 3.15, 190: 3.08,
    180: 3.01, 175: 2.98, 170: 2.94, 165: 2.91, 160: 2.87,
    155: 2.84, 150: 2.82, 145: 2.79, 140: 2.76, 135: 2.73,
    130: 2.70, 125: 2.68, 120: 2.65, 115: 2.62, 110: 2.59,
    105: 2.56, 100: 2.54, 95: 2.51, 90: 2.48, 85: 2.45,
    80: 2.42, 75: 2.40, 70: 2.37, 65: 2.34, 60: 2.32,
    55: 2.29, 50: 2.26, 45: 2.24, 40: 2.21, 35: 2.18,
    30: 2.16, 25: 2.14, 20: 2.12,
  },
  sand: {
    40: 2.65, 35: 2.58, 30: 2.53, 28: 2.48, 26: 2.44,
    24: 2.40, 22: 2.36, 20: 2.32, 18: 2.28, 16: 2.24,
    14: 2.20, 12: 2.18, 10: 2.18, 8: 2.14, 6: 2.10,
    5: 2.08, 4: 2.06, 3: 2.04,
  },
  green: {
    90: 2.40, 80: 2.30, 70: 2.20, 60: 2.15, 55: 2.08,
    50: 2.02, 45: 2.00, 40: 1.93, 35: 1.87, 30: 1.82,
    28: 1.78, 26: 1.75, 24: 1.72, 22: 1.68, 20: 1.63,
    18: 1.58, 16: 1.53, 14: 1.47, 12: 1.42, 10: 1.32,
    9: 1.28, 8: 1.24, 7: 1.20, 6: 1.16, 5: 1.12,
    4: 1.08, 3: 1.04, 2: 1.00, 1: 1.00, 0: 0,
  },
};

/**
 * Scale factors for each benchmark level relative to PGA Tour.
 * Derived from scoring average ratios with empirical adjustments.
 *
 * Scale = (benchmark scoring avg) / (PGA scoring avg)
 * PGA ≈ 70 strokes → 18 holes
 *
 * Putting scale is compressed because putting differences are smaller across skill levels.
 */
const SCALE_FACTORS: Record<BenchmarkLevel, { general: number; putting: number }> = {
  pga_tour:   { general: 1.000, putting: 1.000 },
  scratch:    { general: 1.028, putting: 1.015 },  // 72/70
  ncaa_d1:    { general: 1.057, putting: 1.030 },  // 74/70
  ncaa_d2:    { general: 1.100, putting: 1.055 },  // 77/70
  ncaa_d3:    { general: 1.143, putting: 1.075 },  // 80/70
  break_80:   { general: 1.171, putting: 1.090 },  // 82/70
  break_90:   { general: 1.286, putting: 1.140 },  // 90/70
  break_100:  { general: 1.429, putting: 1.200 },  // 100/70
};

// ============================================================================
// BENCHMARK DATA CACHE
// ============================================================================

const benchmarkCache = new Map<BenchmarkLevel, BaselineData>();

/**
 * Get baseline data for a specific benchmark level.
 * Results are cached for performance.
 */
export function getBenchmarkData(level: BenchmarkLevel): BaselineData {
  // PGA Tour is the canonical source
  if (level === 'pga_tour') return PGA_TOUR_BASELINE;

  // Check cache
  const cached = benchmarkCache.get(level);
  if (cached) return cached;

  // Generate scaled data
  const factors = SCALE_FACTORS[level];
  const scaled = scaleBaseline(PGA_TOUR_BASELINE, factors.general, factors.putting);
  benchmarkCache.set(level, scaled);

  return scaled;
}

// ============================================================================
// COMPARISON SG BASELINES (for relative performance comparison)
// ============================================================================

/**
 * Expected strokes gained per round for each benchmark level.
 * Used when comparing a player's SG against a different skill level.
 *
 * E.g., an NCAA D1 player with SG Total of -1.0 (vs PGA) would be
 * roughly +1.0 vs NCAA D1 baseline.
 */
export const SG_COMPARISON_BASELINES: Record<BenchmarkLevel, {
  sg_off_tee: number;
  sg_approach: number;
  sg_around_green: number;
  sg_putting: number;
  sg_total: number;
}> = {
  pga_tour: {
    sg_off_tee: 0.5,
    sg_approach: 0.5,
    sg_around_green: 0.3,
    sg_putting: 0.2,
    sg_total: 1.5,
  },
  scratch: {
    sg_off_tee: 0,
    sg_approach: 0,
    sg_around_green: 0,
    sg_putting: 0,
    sg_total: 0,
  },
  ncaa_d1: {
    sg_off_tee: -0.3,
    sg_approach: -0.4,
    sg_around_green: -0.2,
    sg_putting: -0.1,
    sg_total: -1.0,
  },
  ncaa_d2: {
    sg_off_tee: -0.6,
    sg_approach: -0.8,
    sg_around_green: -0.4,
    sg_putting: -0.2,
    sg_total: -2.0,
  },
  ncaa_d3: {
    sg_off_tee: -0.9,
    sg_approach: -1.2,
    sg_around_green: -0.6,
    sg_putting: -0.3,
    sg_total: -3.0,
  },
  break_80: {
    sg_off_tee: -1.2,
    sg_approach: -1.6,
    sg_around_green: -0.8,
    sg_putting: -0.4,
    sg_total: -4.0,
  },
  break_90: {
    sg_off_tee: -2.0,
    sg_approach: -2.8,
    sg_around_green: -1.5,
    sg_putting: -0.7,
    sg_total: -7.0,
  },
  break_100: {
    sg_off_tee: -3.0,
    sg_approach: -4.5,
    sg_around_green: -2.5,
    sg_putting: -1.0,
    sg_total: -11.0,
  },
};

