/**
 * v3 genome normalization (W34).
 *
 * Maps heterogeneous dimension values onto a single [0, 1] "good-axis"
 * scale the radar can render. Each dim defines its own normalizer
 * because:
 *   - Some dims are rates already in [0, 1] (driver_usage, scrambling_rate)
 *   - Some are signed deltas where lower = better (back_nine_delta,
 *     pressure_delta, par3_proficiency, scoring_trend)
 *   - Some are symmetric — absolute value closer to 0 = better
 *     (miss_side_bias)
 *
 * `null` values normalize to `null` (radar shows a locked spoke).
 */

import type { DimensionResult } from './types';

export type Normalizer = (value: number) => number;

/** Clamp helper. */
function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** Linear interpolation: maps `value` from [from0, from1] to [0, 1]. */
function linearMap(from0: number, from1: number, value: number): number {
  return clamp01((value - from0) / (from1 - from0));
}

/**
 * Per-dimension normalizers keyed by dimension id. When a new dim
 * ships, add a normalizer here. Missing entries fall back to the
 * identity normalizer (assumes value is already in [0, 1]).
 */
const NORMALIZERS: Record<string, Normalizer> = {
  // Symmetric — 0 is best (no bias)
  miss_side_bias: (v) => clamp01(1 - Math.abs(v)),

  // Negative = better; clamp to [-3, +3] → invert
  pressure_delta: (v) => linearMap(3, -3, v), // -3 → 1, +3 → 0
  par3_proficiency: (v) => linearMap(2, -2, v),
  back_nine_delta: (v) => linearMap(2, -2, v),
  scoring_trend: (v) => linearMap(2, -2, v),

  // Rates [0, 1] — higher = better, identity
  scrambling_rate: (v) => clamp01(v),

  // driver_usage isn't strictly "better at 1" — it's a profile. Map
  // around 0.6 as the neutral "balanced" point so neither extreme
  // looks bad on the radar.
  driver_usage: (v) => clamp01(1 - Math.abs(v - 0.6) / 0.6),
};

/**
 * Project a dimension result onto the radar's [0, 1] good-axis. Null
 * values stay null so the radar can render a "locked" spoke marker.
 */
export function normalizeForRadar(dim_id: string, result: DimensionResult): number | null {
  if (result.value === null) return null;
  if (typeof result.value !== 'number') return null; // string-valued dims aren't on the radar
  const fn = NORMALIZERS[dim_id] ?? clamp01;
  return fn(result.value);
}
