/**
 * Genome dimension: scoring_trend.
 *
 * Category: learning_velocity.
 * Mean score-to-par on the most recent 30 days minus mean on days
 * 31-90. Negative = improving (scores trending down vs pars); positive
 * = regressing.
 *
 * Capped at ±2 strokes/round. Requires ≥3 rounds in each window. Also
 * stores the change's standard error (Welch: each window's own spread over
 * its rounds), so a reader can say the change only past its noise.
 */

import type { DimensionResult, GenomeContext, GenomeDimension } from '../types';

const MIN_PER_WINDOW = 3;

const dim: GenomeDimension = {
  id: 'scoring_trend',
  category: 'learning_velocity',
  label: 'Scoring trend',

  compute(ctx: GenomeContext): DimensionResult {
    const cutoff = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
    const recent = ctx.rounds.filter(
      (r) => r.round_date >= cutoff && r.score_to_par !== null,
    );
    const earlier = ctx.rounds.filter(
      (r) => r.round_date < cutoff && r.score_to_par !== null,
    );
    if (recent.length < MIN_PER_WINDOW || earlier.length < MIN_PER_WINDOW) {
      return { value: null, confidence: null };
    }
    const avg = (rs: typeof recent) =>
      rs.reduce((a, r) => a + (r.score_to_par ?? 0), 0) / rs.length;
    const raw = avg(recent) - avg(earlier);
    // Sample variance of a window (n ≥ 3 here, so n - 1 > 0).
    const variance = (rs: typeof recent) => {
      const m = avg(rs);
      return rs.reduce((a, r) => a + ((r.score_to_par ?? 0) - m) ** 2, 0) / (rs.length - 1);
    };
    const se = Math.sqrt(variance(recent) / recent.length + variance(earlier) / earlier.length);
    const clamped = Math.max(-2, Math.min(2, raw));
    const confidence = Math.min(
      1,
      Math.min(recent.length, earlier.length) / 6,
    );
    const label =
      clamped < -0.3 ? 'Improving' : clamped > 0.3 ? 'Regressing' : 'Flat';
    return { value: Number(clamped.toFixed(2)), confidence, label, se: Number(se.toFixed(3)) };
  },
};

export default dim;
