/**
 * Genome dimension: pressure_delta.
 *
 * Category: pressure_response.
 * Mean score-to-par on tournament/qualifier rounds minus mean
 * score-to-par on practice rounds. Positive = worse under pressure;
 * negative = thrives under pressure.
 *
 * Requires ≥4 tournament+qualifier rounds AND ≥4 practice rounds so the
 * comparison isn't dominated by a single outlier.
 */

import type { DimensionResult, GenomeContext, GenomeDimension } from '../types';

const MIN_PER_SIDE = 4;

const dim: GenomeDimension = {
  id: 'pressure_delta',
  category: 'pressure_response',
  label: 'Pressure delta',
  min_rounds: 8,

  compute(ctx: GenomeContext): DimensionResult {
    const tournament = ctx.rounds.filter(
      (r) => (r.round_type === 'tournament' || r.round_type === 'qualifier') && r.score_to_par !== null,
    );
    const practice = ctx.rounds.filter(
      (r) => r.round_type === 'practice' && r.score_to_par !== null,
    );
    if (tournament.length < MIN_PER_SIDE || practice.length < MIN_PER_SIDE) {
      return { value: null, confidence: null };
    }
    const avg = (xs: typeof tournament) =>
      xs.reduce((a, r) => a + (r.score_to_par ?? 0), 0) / xs.length;
    const t = avg(tournament);
    const p = avg(practice);
    const raw = t - p; // positive = worse under pressure
    // Clamp to ±3 so radar normalization stays bounded.
    const clamped = Math.max(-3, Math.min(3, raw));
    const confidence = Math.min(
      1,
      Math.min(tournament.length, practice.length) / 8,
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
