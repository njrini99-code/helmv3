/**
 * Composite rule: short_side_scrambling_chain (W30.5).
 *
 * Master plan Part IX.2 rule #1. Fires when the player attempts a lot
 * of pitch/chip shots from rough or bunker AND the average post-shot
 * proximity is poor — the "short side" miss is recurring AND being
 * compounded by weak recovery technique.
 *
 * Threshold: ≥10 short-game attempts AND avg post-shot proximity > 15 ft.
 * Uses ctx.short_game_shots (raw shot data).
 */

import type { CompositeRule, CompositeMatch, CompositeContent } from '../types';

const MIN_ATTEMPTS = 10;
const POOR_PROXIMITY_FT = 15;

const rule: CompositeRule = {
  id: 'short_side_scrambling_chain',
  name: 'Short-side scrambling chain',
  priority: 'high',
  category: 'short_game',

  detect(_insights, ctx) {
    if (!ctx || ctx.short_game_shots.length === 0) return null;
    const shots = ctx.short_game_shots;
    if (shots.length < MIN_ATTEMPTS) return null;

    const sumProximity = shots.reduce((a, s) => a + s.distance_to_hole_after, 0);
    const avgProximity = sumProximity / shots.length;
    if (avgProximity <= POOR_PROXIMITY_FT) return null;

    // Distinguish rough vs bunker for the prose. The golf_shots CHECK
    // constraint stores bunker lies as the canonical value 'sand' (not
    // 'bunker') — matching the wrong literal left bunkerPct permanently 0
    // while the prose promised "bunker splash" coaching (sscc-1).
    const roughShots = shots.filter((s) => s.lie_before.includes('rough'));
    const bunkerShots = shots.filter((s) => s.lie_before === 'sand');
    const roughPct = (roughShots.length / shots.length) * 100;
    const bunkerPct = (bunkerShots.length / shots.length) * 100;

    return {
      source_insight_ids: [],
      signals: {
        attempts: shots.length,
        avg_proximity: avgProximity,
        rough_pct: roughPct,
        bunker_pct: bunkerPct,
      },
    };
  },

  compose(match: CompositeMatch): CompositeContent {
    const attempts = Number(match.signals.attempts ?? 0);
    const avgProximity = Number(match.signals.avg_proximity ?? 0);
    const roughPct = Math.round(Number(match.signals.rough_pct ?? 0));
    const bunkerPct = Math.round(Number(match.signals.bunker_pct ?? 0));
    const dominant =
      roughPct > bunkerPct ? `${roughPct}% from rough` : `${bunkerPct}% from bunker`;
    return {
      title: 'Short-side misses are compounding',
      content:
        `You attempted ${attempts} short-game shots from rough or bunker (${dominant}) ` +
        `with average post-shot proximity of ${avgProximity.toFixed(0)} ft — well outside ` +
        `make-able comebacker range. The miss-side pattern is recurring AND the recovery ` +
        `technique isn't bailing you out. Practice short-side flop and bunker splash shots ` +
        `to a tucked pin; the goal is consistent leave-distance, not heroics.`,
      signature: 'short_side_scrambling_chain',
      evidence: {
        metric: 'short_side_proximity',
        metric_label: 'Short-side recovery proximity',
        unit: 'feet',
        your_value: avgProximity,
        your_value_display: `${avgProximity.toFixed(0)} ft avg`,
        comparison_value: 10,
        comparison_label: 'Tour ~10 ft',
        comparison_source: 'pga_baseline',
        sample_n: attempts,
        window_days: 90,
        window_start: '',
        window_end: '',
        strokes_impact: 0,
        strokes_impact_method: 'peer_delta',
        confidence: attempts >= 20 ? 0.75 : 0.6,
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
