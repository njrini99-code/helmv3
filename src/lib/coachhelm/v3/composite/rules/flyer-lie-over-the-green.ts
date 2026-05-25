/**
 * Composite rule: flyer_lie_over_the_green (W30.5).
 *
 * Master plan Part IX.2 rule #9 (reworked from "Flyer-lie under-clubbing"
 * because the 3-bucket model can't say "wrong club" without club
 * granularity). Fires when approach shots FROM light_rough end up
 * meaningfully further from the hole than a healthy benchmark — the
 * flyer-lie "jumps" past the target.
 *
 * v1 threshold: ≥10 approach attempts from light_rough AND avg
 * post-shot proximity > 35 ft. Future enhancement: compare against
 * the player's own fairway-lie proximity at the same distance band.
 *
 * Uses ctx.flyer_lie_shots.
 */

import type { CompositeRule, CompositeMatch, CompositeContent } from '../types';

const MIN_ATTEMPTS = 10;
const POOR_PROXIMITY_FT = 35;

const rule: CompositeRule = {
  id: 'flyer_lie_over_the_green',
  name: 'Flyer-lie over-the-green',
  priority: 'high',
  category: 'approach',

  detect(_insights, ctx) {
    if (!ctx || ctx.flyer_lie_shots.length === 0) return null;
    const shots = ctx.flyer_lie_shots;
    if (shots.length < MIN_ATTEMPTS) return null;

    const sum = shots.reduce((a, s) => a + s.distance_to_hole_after, 0);
    const avgProximity = sum / shots.length;
    if (avgProximity <= POOR_PROXIMITY_FT) return null;

    const avgDistance = shots.reduce((a, s) => a + s.distance_to_hole_before, 0) / shots.length;
    return {
      source_insight_ids: [],
      signals: {
        attempts: shots.length,
        avg_proximity_ft: avgProximity,
        avg_distance_yd: avgDistance,
      },
    };
  },

  compose(match: CompositeMatch): CompositeContent {
    const attempts = Number(match.signals.attempts ?? 0);
    const avgProximity = Number(match.signals.avg_proximity_ft ?? 0);
    const avgDistance = Number(match.signals.avg_distance_yd ?? 0);
    return {
      title: 'Flyer lies are jumping past the green',
      content:
        `From light rough you've hit ${attempts} approaches averaging ` +
        `${avgDistance.toFixed(0)} yd in — and ended up ${avgProximity.toFixed(0)} ft ` +
        `from the hole on average. The flyer effect is real: grass between ` +
        `face and ball reduces spin, and the ball releases hot. Plan one ` +
        `less club from light rough when the lie sits up.`,
      signature: 'flyer_lie_over_the_green',
      evidence: {
        metric: 'flyer_lie_proximity',
        metric_label: 'Flyer-lie approach proximity',
        unit: 'feet',
        your_value: avgProximity,
        your_value_display: `${avgProximity.toFixed(0)} ft avg`,
        comparison_value: 25,
        comparison_label: 'Tour ~25 ft',
        comparison_source: 'pga_baseline',
        sample_n: attempts,
        window_days: 90,
        window_start: '',
        window_end: '',
        strokes_impact: 0,
        strokes_impact_method: 'peer_delta',
        confidence: attempts >= 20 ? 0.7 : 0.55,
        confidence_factors: {
          sample_adequacy: Math.min(attempts / 20, 1),
          recency: 1.0,
          variance: 0.5,
        },
      },
    };
  },
};

export default rule;
