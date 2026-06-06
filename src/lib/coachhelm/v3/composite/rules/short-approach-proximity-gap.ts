/**
 * Composite rule: short_approach_proximity_gap (W30.5).
 *
 * Master plan Part IX.2 rule #4 (renamed from "Wedge proximity gap"
 * for the 3-bucket model). Fires when 50-125 yd approach proximity is
 * poor AND scrambling around the green is also weak — the short-game
 * leak is bigger than either insight alone suggests.
 *
 * Pure insight composite — no ctx needed.
 */

import type { CompositeRule, CompositeMatch, CompositeContent, EvidenceInsight } from '../types';

/** On-green proximity (feet) for an approach_miss insight. `evidence.your_value`
 *  is the green-hit PERCENT post the reach-vs-dial-in redesign; the real
 *  proximity lives in `evidence.detail`. NaN when no reliable proximity. */
function approachProximityFeet(i: EvidenceInsight): number {
  const detail = i.evidence.detail as { proximity_when_hit_feet?: number | null } | undefined;
  const prox = detail?.proximity_when_hit_feet;
  return typeof prox === 'number' && Number.isFinite(prox) ? prox : NaN;
}

function isWeakShortApproach(i: EvidenceInsight): boolean {
  if (i.insight_type !== 'approach_miss') return false;
  if (!i.signature.includes('50_125ft')) return false;
  // 50-125 yd Tour anchor ~18 ft proximity; > 22 ft on-green-when-hit is the
  // dial-in leak. Requires a real proximity (≥ MIN_GREENS hit).
  return approachProximityFeet(i) > 22;
}

function isWeakScrambling(i: EvidenceInsight): boolean {
  if (i.insight_type !== 'scrambling') return false;
  const teamPct = i.evidence.standing?.team_pct;
  return typeof teamPct === 'number' && teamPct < 40;
}

const rule: CompositeRule = {
  id: 'short_approach_proximity_gap',
  name: 'Short approach + scrambling double leak',
  priority: 'high',
  category: 'short_game',

  detect(insights) {
    const approach = insights.find(isWeakShortApproach);
    const scramble = insights.find(isWeakScrambling);
    if (!approach || !scramble) return null;
    return {
      source_insight_ids: [approach.id, scramble.id],
      signals: {
        approach_proximity_ft: approachProximityFeet(approach),
        scramble_pct: Number(scramble.evidence.your_value ?? 0),
      },
    };
  },

  compose(match: CompositeMatch): CompositeContent {
    const proximity = Math.round(Number(match.signals.approach_proximity_ft ?? 0));
    const scramble = Math.round(Number(match.signals.scramble_pct ?? 0));
    return {
      title: 'Short approaches + scrambling are stacking up',
      content:
        `From 50-125 yd you're leaving the ball ${proximity} ft from the ` +
        `hole on average (Tour is ~18 ft) — and you're only saving par ` +
        `${scramble}% of the time when you miss. The two compound: a 30-foot ` +
        `wedge miss to a tucked pin = a near-automatic bogey. Tighten ` +
        `wedge distance control first; the scrambling improves on its own.`,
      signature: 'short_approach_proximity_gap',
      evidence: {
        metric: 'approach_proximity_50_125ft',
        metric_label: 'Short approach + scrambling',
        unit: 'feet',
        your_value: proximity,
        your_value_display: `${proximity} ft avg`,
        comparison_value: 18,
        comparison_label: 'Tour ~18 ft',
        comparison_source: 'pga_baseline',
        sample_n: 10,
        window_days: 90,
        window_start: '',
        window_end: '',
        strokes_impact: 0,
        strokes_impact_method: 'peer_delta',
        confidence: 0.7,
        confidence_factors: { sample_adequacy: 0.8, recency: 1.0, variance: 0.5 },
      },
    };
  },
};

export default rule;
