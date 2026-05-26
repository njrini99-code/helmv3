/**
 * Genome dimension: driver_usage.
 *
 * Category: strategic_profile.
 * Fraction of tee shots played with driver (vs non_driver). Returns
 * value in [0, 1]. Per the 3-bucket club model (master plan Part V.1.5)
 * we can ONLY distinguish driver vs non_driver — finer club granularity
 * is unavailable, so this is the cleanest strategic-profile signal.
 *
 * Requires ≥40 tee shots (~10 rounds with 4 par-4-or-5s each minimum).
 */

import type { DimensionResult, GenomeContext, GenomeDimension } from '../types';

const MIN_TEE_SHOTS = 40;

const dim: GenomeDimension = {
  id: 'driver_usage',
  category: 'strategic_profile',
  label: 'Driver usage',

  compute(ctx: GenomeContext): DimensionResult {
    const tee = ctx.shots.filter(
      (s) =>
        s.shot_type === 'tee' &&
        (s.club_type === 'driver' || s.club_type === 'non_driver'),
    );
    if (tee.length < MIN_TEE_SHOTS) {
      return { value: null, confidence: null };
    }
    const drivers = tee.filter((s) => s.club_type === 'driver').length;
    const rate = drivers / tee.length;
    const confidence = Math.min(1, tee.length / 80);
    const label =
      rate >= 0.75 ? 'Bomber' : rate >= 0.45 ? 'Mixed' : 'Layback profile';
    return { value: Number(rate.toFixed(3)), confidence, label };
  },
};

export default dim;
