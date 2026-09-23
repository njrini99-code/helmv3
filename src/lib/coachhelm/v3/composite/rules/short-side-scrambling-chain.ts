/**
 * Composite rule: short_side_scrambling_chain (W30.5).
 *
 * Master plan Part IX.2 rule #1. Fires when the player attempts a lot
 * of pitch/chip shots from rough or bunker AND the average post-shot
 * proximity is poor.
 *
 * WHAT IT MEASURES (repair plan Package 2, "replace short-side assertions
 * where geometry/annotation is absent"): the recovery LEAVE from rough and
 * sand. It does NOT measure whether the player was short-sided — that needs
 * pin position and miss side, neither of which the shot record carries. The
 * rule id and signature are kept (dedup continuity with existing rows), but
 * the title, prose, and metric label describe the leave, and the short-side
 * question is handed to the coach as a check, not asserted.
 *
 * Threshold: ≥10 short-game attempts AND avg post-shot proximity > 15 ft.
 * Uses ctx.short_game_shots (raw shot data).
 */

import type { CompositeRule, CompositeMatch, CompositeContent } from '../types';

const MIN_ATTEMPTS = 10;
const POOR_PROXIMITY_FT = 15;

/**
 * distance_to_hole_after is stored in mixed units (golf_shots.distance_unit_after
 * is 'feet' for most greenside leaves, 'yards' for longer ones). The proximity
 * gate and the "{n} ft" prose are both in FEET, so yards rows must be converted
 * (×3) before averaging — never blend feet and yards (CANON: UNITS). Without the
 * conversion the average is systematically understated and the 15 ft gate
 * under-fires.
 */
function leaveFeet(s: { distance_to_hole_after: number; distance_unit_after?: string | null }): number {
  return s.distance_unit_after === 'yards' ? s.distance_to_hole_after * 3 : s.distance_to_hole_after;
}

const rule: CompositeRule = {
  id: 'short_side_scrambling_chain',
  name: 'Rough/sand recovery leave',
  priority: 'high',
  category: 'short_game',

  detect(_insights, ctx) {
    if (!ctx || ctx.short_game_shots.length === 0) return null;
    const shots = ctx.short_game_shots;
    if (shots.length < MIN_ATTEMPTS) return null;

    const sumProximity = shots.reduce((a, s) => a + leaveFeet(s), 0);
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
    // Own magnitude (sscc-2): (avg leave − ~10 ft) / 10 ft, bounded to 1.5 so
    // a single bad day can't mint a wild cascade number. This is a ROUGH
    // ESTIMATE — a leave-distance coefficient, not a measured stroke loss —
    // and ships tagged as one so no surface presents it as strokes gained.
    const TOUR_LEAVE_FT = 10;
    const FT_PER_STROKE = 10;
    const ownStrokesImpact = Math.min(
      Math.max(0, (avgProximity - TOUR_LEAVE_FT) / FT_PER_STROKE),
      1.5,
    );
    return {
      title: 'Rough and sand recoveries are leaving long putts',
      content:
        `You attempted ${attempts} short-game shots from rough or bunker (${dominant}); ` +
        `the average leave was ${avgProximity.toFixed(0)} ft — outside make-able range. ` +
        `Whether these were short-sided misses is not recorded: check pin position and ` +
        `miss side on the next few rounds before treating this as a short-side pattern. ` +
        `Recommended: recovery reps from rough and sand to a 10-ft circle — the ` +
        `measurable target is leave distance.`,
      signature: 'short_side_scrambling_chain',
      evidence: {
        metric: 'recovery_proximity_rough_sand',
        metric_label: 'Rough/sand recovery leave',
        unit: 'feet',
        your_value: avgProximity,
        your_value_display: `${avgProximity.toFixed(0)} ft avg`,
        comparison_value: 10,
        comparison_label: 'Tour ~10 ft (approx)',
        comparison_source: 'pga_baseline',
        sample_n: attempts,
        window_days: 90,
        window_start: '',
        window_end: '',
        strokes_impact: ownStrokesImpact,
        strokes_impact_method: 'rough_estimate',
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
