/**
 * Composite rule: doubles_after_bogey (W30.5).
 *
 * Fires when the player's rate of "bogey-or-worse followed by
 * double-or-worse on the next hole" exceeds 20% of bogey opportunities.
 * Compounding-mistake pattern — the bogey itself isn't the leak,
 * the over-correction on the next hole is.
 *
 * Threshold: ≥10 bogey opportunities AND ≥20% compound rate.
 * Uses ctx.hole_scores.
 */

import type { CompositeRule, CompositeMatch, CompositeContent } from '../types';

const MIN_OPPORTUNITIES = 10;
const MIN_RATE = 0.20;

const rule: CompositeRule = {
  id: 'doubles_after_bogey',
  name: 'Doubles after bogey',
  priority: 'urgent',
  category: 'scoring',

  detect(_insights, ctx) {
    if (!ctx || ctx.hole_scores.length === 0) return null;

    // Group by round so we don't accidentally chain across rounds.
    const byRound = new Map<string, Map<number, { par: number; score: number }>>();
    for (const h of ctx.hole_scores) {
      if (!byRound.has(h.round_id)) byRound.set(h.round_id, new Map());
      byRound.get(h.round_id)!.set(h.hole_number, { par: h.par, score: h.score });
    }

    let opportunities = 0;
    let compounded = 0;
    for (const holes of byRound.values()) {
      for (const [holeNum, h] of holes.entries()) {
        const next = holes.get(holeNum + 1);
        if (!next) continue;
        const isBogey = h.score >= h.par + 1;
        if (!isBogey) continue;
        opportunities += 1;
        if (next.score >= next.par + 2) compounded += 1;
      }
    }
    if (opportunities < MIN_OPPORTUNITIES) return null;
    const rate = compounded / opportunities;
    if (rate < MIN_RATE) return null;

    return {
      source_insight_ids: [],
      signals: {
        opportunities,
        compounded,
        rate,
      },
    };
  },

  compose(match: CompositeMatch): CompositeContent {
    const opps = Number(match.signals.opportunities ?? 0);
    const compounded = Number(match.signals.compounded ?? 0);
    const rate = Number(match.signals.rate ?? 0);
    const ratePct = Math.round(rate * 100);
    return {
      title: 'Bogeys turning into doubles too often',
      content:
        `Of your last ${opps} bogey-or-worse holes, the next hole was a ` +
        `double-or-worse ${compounded} times (${ratePct}%). The bogey ` +
        `isn't the problem — the over-correction is. After a bogey, ` +
        `force a 30-second reset before the next tee shot and commit to ` +
        `your stock target rather than chasing.`,
      signature: 'doubles_after_bogey',
      evidence: {
        metric: 'compound_mistake_rate',
        metric_label: 'Doubles-after-bogey rate',
        unit: 'percent',
        your_value: rate * 100,
        your_value_display: `${ratePct}%`,
        comparison_value: 10,
        comparison_label: 'Tour ~10%',
        comparison_source: 'pga_baseline',
        sample_n: opps,
        window_days: 90,
        window_start: '',
        window_end: '',
        strokes_impact: compounded * 0.5, // each compound is ~half-stroke wasted vs healthy recovery
        strokes_impact_method: 'peer_delta',
        confidence: opps >= 20 ? 0.8 : 0.6,
        confidence_factors: {
          sample_adequacy: Math.min(opps / 20, 1),
          recency: 1.0,
          variance: 0.5,
        },
      },
    };
  },
};

export default rule;
