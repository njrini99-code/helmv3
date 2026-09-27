/**
 * Genome dimension: pressure_delta.
 *
 * Category: pressure_response.
 * The pressure gap from the ONE shared rule
 * (src/lib/golf/metrics/pressure-gap.ts, also used by the Fingerprint
 * pressure section): mean to par on tournament/qualifier rounds minus mean
 * to par on practice rounds, 18-hole basis. Positive = worse under pressure;
 * negative = thrives under pressure.
 *
 * Requires ≥4 tournament+qualifier rounds AND ≥4 practice rounds so the
 * comparison isn't dominated by a single outlier. The value is clamped to ±3
 * for the radar; the unclamped gap is the shared function's.
 */

import { computePressureGap } from '@/lib/golf/metrics/pressure-gap';
import type { DimensionResult, GenomeContext, GenomeDimension } from '../types';

const MIN_PER_SIDE = 4;

const dim: GenomeDimension = {
  id: 'pressure_delta',
  category: 'pressure_response',
  label: 'Pressure delta',
  min_rounds: 8,

  compute(ctx: GenomeContext): DimensionResult {
    const result = computePressureGap(ctx.rounds, { minPerSide: MIN_PER_SIDE });
    if (!result) {
      return { value: null, confidence: null };
    }
    const raw = result.gap; // positive = worse under pressure
    // Clamp to ±3 so radar normalization stays bounded.
    const clamped = Math.max(-3, Math.min(3, raw));
    const confidence = Math.min(
      1,
      Math.min(result.pressureRounds, result.practiceRounds) / 8,
    );
    const label =
      clamped > 0.5 ? 'Tightens up' : clamped < -0.5 ? 'Thrives on pressure' : 'Steady';
    return {
      value: Number(clamped.toFixed(2)),
      confidence,
      label,
    };
  },
};

export default dim;
