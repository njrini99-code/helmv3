/**
 * Genome dimension: scrambling_rate.
 *
 * Category: recovery_patterns.
 * Fraction of short-game attempts from rough/bunker that ended within
 * 10 ft of the hole (a rough proxy for "saved par from trouble").
 * Returns value in [0, 1].
 */

import type { DimensionResult, GenomeContext, GenomeDimension } from '../types';

const MIN_ATTEMPTS = 15;
const SAVE_PROXIMITY_FT = 10;

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
        (s.lie_before === 'rough' ||
          s.lie_before === 'heavy_rough' ||
          s.lie_before === 'light_rough' ||
          s.lie_before === 'bunker') &&
        typeof s.distance_to_hole_after === 'number',
    );
    if (attempts.length < MIN_ATTEMPTS) {
      return { value: null, confidence: null };
    }
    const saves = attempts.filter(
      (s) => (s.distance_to_hole_after ?? Infinity) <= SAVE_PROXIMITY_FT,
    );
    const rate = saves.length / attempts.length;
    const confidence = Math.min(1, attempts.length / 30);
    const label =
      rate >= 0.55 ? 'Wizard' : rate >= 0.35 ? 'Reliable' : 'Leaky';
    return { value: Number(rate.toFixed(3)), confidence, label };
  },
};

export default dim;
