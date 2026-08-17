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

/**
 * `miss_direction` is an EIGHT-value compass, not a two-value side. Production
 * carries `left, right, short, long, short_left, short_right, long_left,
 * long_right`.
 *
 * This used to filter on bare `'left'`/`'right'` only, discarding every
 * compound value even though each still names a side. Measured 2026-08-17 over
 * the genome's own 90-day window: of 1,701 approaches with a miss_direction,
 * 1,001 carry a side but only 417 were counted — 58% of the signal thrown away
 * — and the dimension went dark for 10 of the 13 players with enough data.
 *
 * The surviving subsample also pointed the WRONG WAY for players who did clear
 * the floor: Owen Carter read +0.059 (right) on bare values against -0.030
 * (left) on the full set, Tyler Hayes +0.048 against -0.048. A coach reading
 * "misses left" would have had the player working the opposite fault.
 *
 * Pure `short`/`long` return 0 and are excluded — they name no side, and
 * counting them would drag every bias toward symmetric.
 */
function sideOf(missDirection: string | null | undefined): -1 | 0 | 1 {
  switch (missDirection) {
    case 'left':
    case 'short_left':
    case 'long_left':
      return -1;
    case 'right':
    case 'short_right':
    case 'long_right':
      return 1;
    default:
      return 0;
  }
}

const dim: GenomeDimension = {
  id: 'miss_side_bias',
  category: 'miss_tendencies',
  label: 'Miss-side bias',
  min_rounds: 8,

  compute(ctx: GenomeContext): DimensionResult {
    const approaches = ctx.shots.filter(
      (s) => s.shot_type === 'approach' && sideOf(s.miss_direction) !== 0,
    );
    if (approaches.length < MIN_APPROACHES) {
      return { value: null, confidence: null };
    }

    let left = 0;
    let right = 0;
    for (const s of approaches) {
      if (sideOf(s.miss_direction) === -1) left += 1;
      else right += 1;
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
