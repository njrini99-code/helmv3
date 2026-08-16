/**
 * Composite rule: long_approach_3putt_cascade.
 *
 * Renamed from "long-iron → 3-putt cascade" per the 3-bucket club model
 * (master plan Part IX.2). Fires when the player has:
 *   1. A weak approach-miss insight in the 175+ yd bucket (poor proximity)
 *   2. A weak long-putt insight (10-15 ft below team_pct 50)
 *
 * The chain: long approaches → leave long putts → 3-putts. Per
 * Research doc §4: "Every 5 ft closer ≈ 10-15 percentage points of
 * conversion in the 5-15 ft zone."
 */

import type { CompositeRule, EvidenceInsight, CompositeMatch, CompositeContent } from '../types';

/** Proximity-when-on-green (feet) for an approach_miss insight. Post the
 *  reach-vs-dial-in redesign, `evidence.your_value` is the green-hit PERCENT,
 *  NOT feet — the real on-green proximity lives in `evidence.detail`. Returns
 *  NaN when no reliable proximity was recorded (too few greens hit). */
function approachProximityFeet(i: EvidenceInsight): number {
  const detail = i.evidence.detail as { proximity_when_hit_feet?: number | null } | undefined;
  const prox = detail?.proximity_when_hit_feet;
  return typeof prox === 'number' && Number.isFinite(prox) ? prox : NaN;
}

/**
 * "Weak" on-green proximity from 175+ yd, in FEET.
 *
 * EMPIRICAL, not a Tour benchmark — and the distinction is the whole point.
 *
 * This gate used to read `> 50`, justified as "Tour ~45 ft from 175+ yd; > 50
 * is weak". That comparison is invalid. The PGA Tour ~45 ft figure (research
 * doc §2, "200+ yds: ~45+ ft") is Proximity to Hole over ALL approaches from
 * the range, misses included. `proximity_when_hit_feet` is averaged over
 * GREEN-FINDING SHOTS ONLY (approach-miss.ts:173) — conditioning on hitting
 * the green removes every long miss, so the conditional mean is necessarily far
 * smaller. Gating a conditional measure on an unconditional benchmark made this
 * rule unfireable.
 *
 * Measured over all 29 production `approach_miss:175_plus` insights carrying a
 * proximity: min 14.0, p25 22.7, median 24.8, p75 31.0, p90 33.3, max 36.3 ft.
 * ZERO exceeded 50. The rule has never fired.
 *
 * 31 ft is the production p75 — the worst quartile of long-approach dial-in.
 * It is deliberately a PERCENTILE and not a benchmark: no sourced on-green
 * proximity standard exists for this bucket, and inventing one is what broke
 * this rule the first time. Revisit once `approach_miss` carries standing
 * (today 0 of 117 production rows do, vs 110/110 for putt_distance), at which
 * point this should become a cohort-relative gate like `isWeakMidPutt`.
 */
const WEAK_ON_GREEN_PROXIMITY_FT = 31;

function isWeakLongApproach(i: EvidenceInsight): boolean {
  return (
    i.insight_type === 'approach_miss' &&
    i.signature.includes('175_plus_ft') &&
    // Dial-in leak: finishing far from the hole WHEN the green is found.
    // Requires a real proximity (≥ MIN_GREENS hit) — without one we can't
    // claim a 3-putt cascade.
    approachProximityFeet(i) > WEAK_ON_GREEN_PROXIMITY_FT
  );
}

function isWeakMidPutt(i: EvidenceInsight): boolean {
  if (i.insight_type !== 'putt_distance') return false;
  if (!i.signature.includes('10_15ft')) return false;
  const teamPct = i.evidence.standing?.team_pct;
  return typeof teamPct === 'number' && teamPct < 50;
}

const rule: CompositeRule = {
  id: 'long_approach_3putt_cascade',
  name: 'Long approach → 3-putt cascade',
  priority: 'high',
  category: 'approach',

  detect(insights: EvidenceInsight[]): CompositeMatch | null {
    const longApproach = insights.find(isWeakLongApproach);
    const midPutt = insights.find(isWeakMidPutt);
    if (!longApproach || !midPutt) return null;
    return {
      source_insight_ids: [longApproach.id, midPutt.id],
      signals: {
        approach_proximity_ft: approachProximityFeet(longApproach),
        mid_putt_pct: Number(midPutt.evidence.your_value ?? 0),
        // Honest floor: a composite is only as well-evidenced as its
        // thinnest source. Mirrors lag-distance-3putt.ts:78-81.
        sample_n: Math.min(
          Number(longApproach.evidence.sample_n ?? 0),
          Number(midPutt.evidence.sample_n ?? 0),
        ),
      },
    };
  },

  compose(match: CompositeMatch): CompositeContent {
    const proximity = Math.round(Number(match.signals.approach_proximity_ft ?? 0));
    const midPct = Math.round(Number(match.signals.mid_putt_pct ?? 0));
    return {
      title: `Long approaches are leaking 3-putts`,
      content:
        `Your 175+ yd approaches average ${proximity} ft from the hole, leaving ` +
        `you in the 10-15 ft zone where you're only converting ${midPct}%. ` +
        `That's the canonical cascade: long approach → mid-range putt → 3-putt ` +
        `risk. Every 5 ft closer on those approaches is worth ~10-15 percentage ` +
        `points of conversion (Research doc §4). Worth dialing in your stock ` +
        `200-yd shot before grinding on the 10-15 ft putting drill.`,
      signature: `long_approach_3putt_cascade`,
      evidence: {
        metric: 'approach_proximity_175_plus_ft',
        metric_label: 'Long approach → 3-putt cascade',
        unit: 'feet',
        your_value: proximity,
        your_value_display: `${proximity} ft`,
        comparison_value: 45,
        comparison_label: 'PGA Tour 175+ yd avg',
        comparison_source: 'pga_baseline',
        sample_n: Number(match.signals.sample_n ?? 0),
        window_days: 30,
        window_start: '',
        window_end: '',
        strokes_impact: 0,
        strokes_impact_method: 'peer_delta',
        confidence: 0.65,
        confidence_factors: {
          sample_adequacy: 0.7,
          recency: 1.0,
          variance: 0.5,
        },
      },
    };
  },
};

export default rule;
