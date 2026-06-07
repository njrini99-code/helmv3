/**
 * Genome dimension: scrambling_rate.
 *
 * Category: recovery_patterns.
 * Fraction of short-game attempts from rough/sand that ended within
 * 10 ft of the hole (a rough proxy for "saved par from trouble").
 * Returns value in [0, 1].
 */

import type { DimensionResult, GenomeContext, GenomeDimension } from '../types';

const MIN_ATTEMPTS = 15;
const SAVE_PROXIMITY_FT = 10;

/**
 * distance_to_hole_after is stored in mixed units (golf_shots.distance_unit_after
 * is 'feet' for most short-game leaves but 'yards' for longer ones). The SAVE
 * threshold is in FEET, so yards rows must be converted (×3) before the compare —
 * never average/compare a feet threshold against a raw yards value (CANON: UNITS).
 */
function leaveFeet(s: { distance_to_hole_after: number | null; distance_unit_after?: string | null }): number {
  const raw = s.distance_to_hole_after ?? Infinity;
  return s.distance_unit_after === 'yards' ? raw * 3 : raw;
}

const dim: GenomeDimension = {
  id: 'scrambling_rate',
  category: 'recovery_patterns',
  label: 'Scrambling rate',

  compute(ctx: GenomeContext): DimensionResult {
    const attempts = ctx.shots.filter(
      (s) =>
        // Post-040 short-game shots are stored as 'around_green' (the
        // CHECK constraint forbids 'chip'/'pitch'). Pre-040 prod data may
        // still carry legacy values — accept all three to match
        // shot-analytics.ts:410 and keep historical scrambling-rate
        // computation accurate.
        (s.shot_type === 'around_green' ||
          s.shot_type === 'chip' ||
          s.shot_type === 'pitch') &&
        // Canonical recovery lies actually stored in golf_shots are 'rough'
        // and 'sand'. The old 'heavy_rough'/'light_rough'/'bunker' literals
        // match zero rows, which silently excluded EVERY greenside-sand
        // recovery and inflated the rate (CANON: sand-save/scrambling).
        (s.lie_before === 'rough' || s.lie_before === 'sand') &&
        typeof s.distance_to_hole_after === 'number',
    );
    if (attempts.length < MIN_ATTEMPTS) {
      return { value: null, confidence: null };
    }
    const saves = attempts.filter((s) => leaveFeet(s) <= SAVE_PROXIMITY_FT);
    const rate = saves.length / attempts.length;
    const confidence = Math.min(1, attempts.length / 30);
    const label =
      rate >= 0.55 ? 'Wizard' : rate >= 0.35 ? 'Reliable' : 'Leaky';
    return { value: Number(rate.toFixed(3)), confidence, label };
  },
};

export default dim;
