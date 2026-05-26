/**
 * Genome dimension: back_nine_delta.
 *
 * Category: stamina.
 * Mean score-to-par on holes 10-18 minus mean score-to-par on holes
 * 1-9. Positive = back-9 worse (stamina leak); negative = closer.
 *
 * Capped at ±2 strokes/hole. Note: closing-hole composite (W28) checks
 * holes 13-18 vs 1-12; this is the broader 9-vs-9 split for stamina
 * profiling on the radar.
 */

import type { DimensionResult, GenomeContext, GenomeDimension } from '../types';

const MIN_ROUNDS = 5;

const dim: GenomeDimension = {
  id: 'back_nine_delta',
  category: 'stamina',
  label: 'Back-9 stamina',

  compute(ctx: GenomeContext): DimensionResult {
    if (ctx.recent_rounds_count < MIN_ROUNDS) {
      return { value: null, confidence: null };
    }
    let frontSum = 0, frontN = 0, backSum = 0, backN = 0;
    for (const h of ctx.hole_scores) {
      const toPar = h.score - h.par;
      if (h.hole_number >= 1 && h.hole_number <= 9) {
        frontSum += toPar; frontN += 1;
      } else if (h.hole_number >= 10 && h.hole_number <= 18) {
        backSum += toPar; backN += 1;
      }
    }
    if (frontN === 0 || backN === 0) {
      return { value: null, confidence: null };
    }
    const raw = backSum / backN - frontSum / frontN;
    const clamped = Math.max(-2, Math.min(2, raw));
    const confidence = Math.min(1, ctx.recent_rounds_count / 10);
    const label =
      clamped > 0.2 ? 'Fades late' : clamped < -0.2 ? 'Closes strong' : 'Steady';
    return { value: Number(clamped.toFixed(2)), confidence, label };
  },
};

export default dim;
