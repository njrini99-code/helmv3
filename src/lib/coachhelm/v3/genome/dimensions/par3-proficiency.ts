/**
 * Genome dimension: par3_proficiency.
 *
 * Category: course_type_affinity.
 * Average score-to-par on par-3 holes, signed (negative = under, good).
 * Captures one-shot accuracy and tee-club distance control as a
 * course-archetype affinity signal (shorter, par-3-heavy tracks favor
 * players with low par3_proficiency values).
 *
 * Capped at ±2 so radar normalization stays bounded.
 */

import type { DimensionResult, GenomeContext, GenomeDimension } from '../types';

const MIN_PAR3_HOLES = 16; // ~4 rounds with 4 par-3s each

const dim: GenomeDimension = {
  id: 'par3_proficiency',
  category: 'course_type_affinity',
  label: 'Par-3 proficiency',

  compute(ctx: GenomeContext): DimensionResult {
    const par3 = ctx.hole_scores.filter((h) => h.par === 3);
    if (par3.length < MIN_PAR3_HOLES) {
      return { value: null, confidence: null };
    }
    const avg = par3.reduce((a, h) => a + (h.score - h.par), 0) / par3.length;
    const clamped = Math.max(-2, Math.min(2, avg));
    const confidence = Math.min(1, par3.length / 30);
    const label =
      clamped < -0.1 ? 'Under par' : clamped < 0.2 ? 'Even' : 'Bleeds shots';
    return { value: Number(clamped.toFixed(2)), confidence, label };
  },
};

export default dim;
