/**
 * Composite rule: front_9_starter (W30.5).
 *
 * Fires when avg score-to-par on holes 1-3 is meaningfully worse than
 * on holes 4-18. Slow-starter pattern — warmup or first-tee nerves.
 * Threshold: ≥0.5 strokes/hole worse, and at least MIN_SAMPLE_N rounds in
 * sample (the platform evidence floor — see the MIN_ROUNDS note below).
 *
 * Uses ctx.hole_scores. Complementary to closing_hole_fatigue:
 * suppression handles overlap if both fire (subset check by ids —
 * they read no insights, so neither suppresses the other).
 *
 * f9s-1: cross-suppress against the warmup-hole Tier-1 generator. Both
 * describe the same "slow start" phenomenon on the same metric
 * (`opening_hole_delta`) — warmup_hole over hole 1, this rule over holes
 * 1-3 — so emitting both double-surfaces one leak to the coach. The runner's
 * id-subset suppression can't catch it (this rule carries
 * `source_insight_ids: []`), so we suppress here: if a warmup_hole insight
 * already exists in the window, defer to it and don't also fire.
 */

import { MIN_SAMPLE_N } from '@/lib/coachhelm/v2/insights/upsert';
import type { CompositeRule, CompositeMatch, CompositeContent } from '../types';

/**
 * This rule reports its distinct-round count AS `evidence.sample_n`, so its
 * detect() gate must be the platform evidence floor itself. At the old value
 * of 3 the rule fired, composed, and was then refused by `upsertInsight` on
 * every run for any player with 3-4 rounds — it could never publish, and the
 * counted throw disabled `synthesizeForPlayer`'s stale-composite sweep for
 * that player. Declining below the floor is the honest behavior: clamping
 * sample_n up is forbidden by the evidence contract.
 */
const MIN_ROUNDS = MIN_SAMPLE_N;
const MIN_DELTA = 0.5;

const rule: CompositeRule = {
  id: 'front_9_starter',
  name: 'Front-9 slow starter',
  priority: 'high',
  category: 'scoring',

  detect(insights, ctx) {
    if (!ctx || ctx.hole_scores.length === 0) return null;

    // f9s-1: defer to the warmup-hole Tier-1 generator if it already
    // surfaced the opening-hole tax — same metric, same phenomenon.
    const warmupAlreadyFired = insights.some(
      (i) =>
        i.insight_type === 'warmup_hole' ||
        i.evidence?.standing?.metric_id === 'opening_hole_delta',
    );
    if (warmupAlreadyFired) return null;

    const distinctRounds = new Set(ctx.hole_scores.map((h) => h.round_id));
    if (distinctRounds.size < MIN_ROUNDS) return null;

    const opening = { sum: 0, n: 0 };
    const rest = { sum: 0, n: 0 };
    for (const h of ctx.hole_scores) {
      const toPar = h.score - h.par;
      if (h.hole_number >= 1 && h.hole_number <= 3) {
        opening.sum += toPar;
        opening.n += 1;
      } else if (h.hole_number >= 4 && h.hole_number <= 18) {
        rest.sum += toPar;
        rest.n += 1;
      }
    }
    if (opening.n === 0 || rest.n === 0) return null;

    const openingAvg = opening.sum / opening.n;
    const restAvg = rest.sum / rest.n;
    const delta = openingAvg - restAvg;
    if (delta < MIN_DELTA) return null;

    return {
      source_insight_ids: [],
      signals: {
        opening_avg: openingAvg,
        rest_avg: restAvg,
        delta,
        rounds: distinctRounds.size,
      },
    };
  },

  compose(match: CompositeMatch): CompositeContent {
    const delta = Number(match.signals.delta ?? 0);
    const rounds = Number(match.signals.rounds ?? 0);
    const openingAvg = Number(match.signals.opening_avg ?? 0);
    const restAvg = Number(match.signals.rest_avg ?? 0);
    return {
      title: 'Slow start — holes 1-3 are leaking strokes',
      content:
        `Across your last ${rounds} rounds, holes 1-3 average ${openingAvg.toFixed(2)} ` +
        `to par while holes 4-18 average ${restAvg.toFixed(2)} — ` +
        `that's +${delta.toFixed(2)} strokes/hole on the opening stretch. ` +
        `Slow starts are usually warmup, not technique. Add 5 more putts and ` +
        `3 wedge shots to your range routine and arrive 20 minutes earlier.`,
      signature: 'front_9_starter',
      evidence: {
        metric: 'opening_hole_delta',
        metric_label: 'Slow-start fade',
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
        strokes_impact: delta * 3,
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
