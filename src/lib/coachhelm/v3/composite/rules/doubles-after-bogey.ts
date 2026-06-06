/**
 * Composite rule: doubles_after_bogey (W30.5).
 *
 * Fires when the player's rate of "bogey-or-worse followed by
 * double-or-worse on the next hole" exceeds 20% of bogey opportunities.
 * Compounding-mistake pattern — the bogey itself isn't the leak,
 * the over-correction on the next hole is.
 *
 * Threshold: ≥10 bogey opportunities, spread across ≥2 rounds AND from
 * ≥3 rounds in the window, AND ≥20% compound rate.
 * Uses ctx.hole_scores.
 *
 * The round guards (DAB-1/DAB-2) stop a single blow-up round from
 * minting an "urgent" 3.5-strokes/round card: one 15-bogey collapse can
 * clear the 10-opportunity floor on its own, and dividing its compounded
 * count by `rounds = 1` inflates the per-round magnitude that ranks the
 * card #1. Requiring ≥3 rounds (matches closing-hole-fatigue / front-9-
 * starter) AND bogeys in ≥2 distinct rounds makes this a genuine pattern.
 */

import type { CompositeRule, CompositeMatch, CompositeContent } from '../types';

const MIN_OPPORTUNITIES = 10;
const MIN_RATE = 0.20;
// Sibling ctx rules (closing-hole-fatigue, front-9-starter) gate on ≥3 rounds.
const MIN_ROUNDS = 3;
// The bogey opportunities themselves must span ≥2 rounds, so a single
// outlier round can't produce the whole signal.
const MIN_ROUNDS_WITH_BOGEY = 2;

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
    // DAB-1: need enough rounds for a per-round rate to mean anything.
    if (byRound.size < MIN_ROUNDS) return null;

    let opportunities = 0;
    let compounded = 0;
    const roundsWithBogey = new Set<string>();
    for (const [roundId, holes] of byRound.entries()) {
      for (const [holeNum, h] of holes.entries()) {
        const next = holes.get(holeNum + 1);
        if (!next) continue;
        const isBogey = h.score >= h.par + 1;
        if (!isBogey) continue;
        opportunities += 1;
        roundsWithBogey.add(roundId);
        if (next.score >= next.par + 2) compounded += 1;
      }
    }
    if (opportunities < MIN_OPPORTUNITIES) return null;
    // DAB-2: the bogey opportunities must span ≥2 rounds — otherwise one
    // blow-up round can clear the floor alone and (÷ rounds) inflate the
    // per-round magnitude into a #1-ranked "urgent" card.
    if (roundsWithBogey.size < MIN_ROUNDS_WITH_BOGEY) return null;
    const rate = compounded / opportunities;
    if (rate < MIN_RATE) return null;

    return {
      source_insight_ids: [],
      signals: {
        opportunities,
        compounded,
        rate,
        // Round count in the window — used to express strokes_impact PER ROUND
        // so it's comparable with the other composites' per-round magnitudes.
        rounds: byRound.size,
      },
    };
  },

  compose(match: CompositeMatch): CompositeContent {
    const opps = Number(match.signals.opportunities ?? 0);
    const compounded = Number(match.signals.compounded ?? 0);
    const rate = Number(match.signals.rate ?? 0);
    const rounds = Math.max(1, Number(match.signals.rounds ?? 1));
    const ratePct = Math.round(rate * 100);
    // ~0.5 wasted stroke per compound mistake, expressed PER ROUND so it ranks
    // on the same scale as the other (per-round) composite magnitudes — the
    // raw 90-day count would otherwise systematically out-rank them.
    const strokesPerRound = (compounded * 0.5) / rounds;
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
        strokes_impact: strokesPerRound, // per-round (see strokesPerRound above)
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
