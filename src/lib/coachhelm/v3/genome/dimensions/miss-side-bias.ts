/**
 * Genome dimension: miss_side_bias.
 *
 * Category: miss_tendencies.
 * Computes the player's net left/right miss bias across all approach
 * shots in the window. Returns a value in [-1, 1] where:
 *   -1 = always misses left,  +1 = always misses right,  0 = symmetric.
 *
 * Requires ≥30 approach shots with a non-null miss_direction (each
 * round produces ~10 approaches, so this lines up with the 8-round
 * floor most dimensions share).
 */

import type { DimensionResult, GenomeContext, GenomeDimension } from '../types';

const MIN_APPROACHES = 30;

const dim: GenomeDimension = {
  id: 'miss_side_bias',
  category: 'miss_tendencies',
  label: 'Miss-side bias',
  min_rounds: 8,

  compute(ctx: GenomeContext): DimensionResult {
    const approaches = ctx.shots.filter(
      (s) =>
        s.shot_type === 'approach' &&
        (s.miss_direction === 'left' || s.miss_direction === 'right'),
    );
    if (approaches.length < MIN_APPROACHES) {
      return { value: null, confidence: null };
    }

    let left = 0;
    let right = 0;
    for (const s of approaches) {
      if (s.miss_direction === 'left') left += 1;
      else if (s.miss_direction === 'right') right += 1;
    }
    const total = left + right;
    const value = (right - left) / total; // [-1, 1]
    const confidence = Math.min(1, total / 60);

    const label =
      value < -0.2
        ? 'Left bias'
        : value > 0.2
          ? 'Right bias'
          : 'Symmetric';

    return { value: Number(value.toFixed(3)), confidence, label };
  },
};

export default dim;
