/**
 * Composite rule: closing_hole_fatigue (W30.5).
 *
 * Fires when the player's avg score-to-par on holes 13-18 is
 * meaningfully worse than on holes 1-12 across the recent window.
 * Threshold: ≥0.5 strokes/hole worse AND ≥3 rounds in sample.
 *
 * Uses ctx.hole_scores (no Tier-1 insight currently captures this).
 */

import type { CompositeRule, CompositeMatch, CompositeContent } from '../types';

const MIN_ROUNDS = 3;
const MIN_DELTA = 0.5;

const rule: CompositeRule = {
  id: 'closing_hole_fatigue',
  name: 'Closing-hole fatigue',
  priority: 'high',
  category: 'scoring',

  detect(_insights, ctx) {
    if (!ctx || ctx.hole_scores.length === 0) return null;

    const distinctRounds = new Set(ctx.hole_scores.map((h) => h.round_id));
    if (distinctRounds.size < MIN_ROUNDS) return null;

    let early = { sum: 0, n: 0 };
    let late = { sum: 0, n: 0 };
    for (const h of ctx.hole_scores) {
      const toPar = h.score - h.par;
      if (h.hole_number >= 1 && h.hole_number <= 12) {
        early.sum += toPar;
        early.n += 1;
      } else if (h.hole_number >= 13 && h.hole_number <= 18) {
        late.sum += toPar;
        late.n += 1;
      }
    }
    if (early.n === 0 || late.n === 0) return null;

    const earlyAvg = early.sum / early.n;
    const lateAvg = late.sum / late.n;
    const delta = lateAvg - earlyAvg; // positive = closing holes worse
    if (delta < MIN_DELTA) return null;

    return {
      // No source insight ids — this rule reads from ctx not insights.
      source_insight_ids: [],
      signals: {
        early_avg: earlyAvg,
        late_avg: lateAvg,
        delta,
        rounds: distinctRounds.size,
      },
    };
  },

  compose(match: CompositeMatch): CompositeContent {
    const delta = Number(match.signals.delta ?? 0);
    const rounds = Number(match.signals.rounds ?? 0);
    const earlyAvg = Number(match.signals.early_avg ?? 0);
    const lateAvg = Number(match.signals.late_avg ?? 0);

    return {
      title: 'Closing 6 holes are leaking strokes',
      content:
        `Across your last ${rounds} rounds, holes 1-12 average ${earlyAvg.toFixed(2)} ` +
        `to par while holes 13-18 average ${lateAvg.toFixed(2)} to par — ` +
        `that's +${delta.toFixed(2)} strokes/hole on the closing stretch. ` +
        `Closing-hole fade is usually fitness or focus, not technique. ` +
        `Try a routine reset before hole 13 — hydrate, recommit to your pre-shot.`,
      signature: 'closing_hole_fatigue',
      evidence: {
        metric: 'closing_hole_delta',
        metric_label: 'Closing-hole fade',
        unit: 'strokes',
        your_value: delta,
        your_value_display: `+${delta.toFixed(2)}/hole`,
        comparison_value: 0,
        comparison_label: 'No fade',
        comparison_source: 'your_baseline',
        sample_n: rounds,
        window_days: 90,
        window_start: '',
        window_end: '',
        strokes_impact: delta * 6, // 6 closing holes
        strokes_impact_method: 'peer_delta',
        confidence: rounds >= 5 ? 0.75 : 0.55,
        confidence_factors: {
          sample_adequacy: Math.min(rounds / 5, 1),
          recency: 1.0,
          variance: 0.5,
        },
      },
    };
  },
};

export default rule;
