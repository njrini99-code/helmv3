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
// GENDER BASELINE (women's SG scaling)
// ============================================================================

/**
 * Women's Strokes-Gained baseline scale factor.
 *
 * Women's-team players drive shorter, so they face longer approaches that the
 * men's Broadie curve over-penalizes — reading their SG ~5-6 strokes/round too
 * negative (e.g. -12 to -29 SG/round). Scaling the men's expected-strokes curve
 * by this single telescoping-preserving factor lands women's SG at ~-(over par),
 * the same band as men's (verified: women's per-round residual -6.0 -> -0.20).
 *
 * AUTHORITATIVE SOURCE OF TRUTH IS THE DATABASE: stored + displayed SG is
 * computed by the gender-aware DB functions sg_expected_strokes /
 * recalculate_round_strokes_gained / calculate_round_strokes_gained
 * (migration 20260607170000), keyed off golf_teams.gender (20260607160000).
 * This constant mirrors the DB factor so any TS-side SG recompute or benchmark
 * display agrees. KEEP IN SYNC with the DB `v_womens_scale` constant.
 */
export const WOMENS_SG_SCALE = 1.083;

export type TeamGender = 'mens' | 'womens';

/**
 * SG expected-strokes scale factor for a team's gender. Men's (and unknown) is
 * 1.0 (the men's PGA Tour / Broadie baseline, unchanged); women's applies
 * {@link WOMENS_SG_SCALE}. Mirrors the DB `CASE WHEN gender='womens' ...` logic.
 */
export function genderScaleFactor(gender: TeamGender | null | undefined): number {
  return gender === 'womens' ? WOMENS_SG_SCALE : 1.0;
}

// ============================================================================
// SELECTABLE PER-TEAM SG BASELINES (coach setting)
// ============================================================================

/**
 * The SG baseline a team's Strokes Gained is computed against — a coach setting
 * (Coaching Intelligence) persisted in golf_team_settings.sg_baseline. Each maps
 * to a uniform expected-strokes scale factor; the DB recomputes the team's stored
 * SG when changed (see sg_baseline_scale / sg_scale_for_player, migration
 * 20260607200000). KEEP THE SCALES IN SYNC WITH THE DB sg_baseline_scale().
 */
// Strokes-gained baselines are PGA Tour (men) and LPGA (women) ONLY. NCAA
// division (D1/D2/D3) and scratch scales were removed 2026-06-22 — every team's
// SG anchors to its gender's Tour, chosen automatically (no coach selector).
export type SgBaselineKey = 'pga_tour' | 'womens';

export interface SgBaselineOption {
  key: SgBaselineKey;
  label: string;
  scale: number;
  description: string;
}

export const SG_BASELINE_OPTIONS: SgBaselineOption[] = [
  { key: 'pga_tour', label: 'PGA Tour', scale: 1.0,            description: 'Men’s professional (Broadie / ShotLink) — the reference for men’s teams.' },
  { key: 'womens',   label: 'LPGA',     scale: WOMENS_SG_SCALE, description: 'Women’s Tour baseline — the reference for women’s teams.' },
];

const SG_BASELINE_SCALE_BY_KEY: Record<SgBaselineKey, number> = SG_BASELINE_OPTIONS.reduce(
  (acc, o) => { acc[o.key] = o.scale; return acc; },
  {} as Record<SgBaselineKey, number>,
);

/** Scale factor for a baseline key (defaults to 1.0 / PGA Tour for unknown keys). */
export function sgBaselineScale(key: SgBaselineKey | null | undefined): number {
  return key ? (SG_BASELINE_SCALE_BY_KEY[key] ?? 1.0) : 1.0;
}

/** The default baseline for a team when none is set: women's teams -> Women's, else PGA Tour. */
export function defaultSgBaseline(gender: TeamGender | null | undefined): SgBaselineKey {
  return gender === 'womens' ? 'womens' : 'pga_tour';
}

/** The effective baseline for a team: its explicit setting, else the gender default. */
export function effectiveSgBaseline(
  setting: SgBaselineKey | null | undefined,
  gender: TeamGender | null | undefined,
): SgBaselineKey {
  return setting ?? defaultSgBaseline(gender);
}

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

// PGA Tour baseline (Broadie "Every Shot Counts" / ShotLink expected strokes).
// MUST stay identical to PGA_BASELINE_DATA in strokes-gained.ts and the DB
// function public.sg_expected_strokes(). Anchors only — getExpectedStrokes()
// interpolates linearly between them. See migration
// 20260606140000_fix_sg_expected_strokes_baseline_calibration.sql for the
// recalibration rationale (prior values were mis-calibrated and inconsistent:
// tee too high with no data <260yd, fairway/rough ~0.3-0.5 low, green too low).
const PGA_TOUR_BASELINE: BaselineData = {
  tee: {
    600: 4.85, 540: 4.65, 400: 3.99, 300: 3.71, 240: 3.25,
    200: 3.12, 150: 2.95, 120: 2.88, 100: 2.82, 80: 2.78,
  },
  fairway: {
    540: 4.78, 400: 4.11, 300: 3.78, 240: 3.45, 200: 3.19,
    180: 3.08, 140: 2.91, 100: 2.80, 80: 2.75, 20: 2.40,
  },
  rough: {
    540: 4.97, 400: 4.30, 300: 3.90, 240: 3.64, 200: 3.42,
    100: 3.02, 20: 2.59,
  },
  sand: {
    540: 5.36, 400: 4.69, 300: 4.04, 240: 3.84, 200: 3.55,
    100: 3.23, 20: 2.53,
  },
  green: {
    90: 2.40, 60: 2.21, 50: 2.14, 40: 2.06, 30: 1.98,
    20: 1.87, 15: 1.78, 10: 1.61, 9: 1.56, 8: 1.50,
    7: 1.42, 6: 1.34, 5: 1.23, 4: 1.13, 3: 1.04,
    2: 1.00, 1: 1.00, 0: 0,
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

