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
 * WHY THE SIBLING RULE IS FINE AND MUST NOT BE "FIXED" BY ANALOGY.
 * `short_approach_proximity_gap` gates the 50-125 yd bucket at `> 22` against a
 * Tour anchor of ~18 ft — formally the same conditional/unconditional mismatch,
 * but harmless, because the size of that mismatch SCALES WITH MISS RATE. From
 * 50-125 yd the green-hit rate is ~75-80%, so conditioning discards few shots
 * and the conditional mean lands near the unconditional anchor (production
 * median 18.3 vs anchor 18); that gate passes 6 of 36 rows — alive and
 * selective. From 175+ yd the green-hit rate is ~50%, so conditioning discards
 * half the sample — precisely the worst half — and the anchor stops meaning
 * anything. Measured: 50-125 median 18.3 / max 25.9; 175+ median 24.8 /
 * max 36.3.
 *
 * HOW THE 50 GOT HERE (it was never a feet threshold). Per the 2026-06-05
 * engine audit, this gate originally read `evidence.your_value > 50` where
 * your_value is the green-hit PERCENT — so it fired BACKWARDS, selecting the
 * best reachers. The redesign correctly repointed it at a real proximity in
 * feet but CARRIED THE 50 ACROSS and justified it after the fact as "Tour 45,
 * +5". At the same time the unit fix (off-green misses in YARDS were being ×3'd
 * into fake feet, the documented "175+ → 63 ft" artifact) dropped real
 * proximity from ~60 ft to ~26 ft. A threshold calibrated against inflated
 * values, applied to corrected ones, silently stops matching anything — and the
 * 60 ft test fixture is a fossil of that same era.
 *
 * 31 ft is the production p75 — the worst quartile of long-approach dial-in.
 * It is deliberately a PERCENTILE and not a benchmark: no sourced on-green
 * proximity standard exists for this bucket, and inventing one is what broke
 * this rule the first time. Revisit once `approach_miss` carries standing
 * (today 0 of 117 production rows do, vs 110/110 for putt_distance), at which
 * point this should become a cohort-relative gate like `isWeakMidPutt`.
 */
const WEAK_ON_GREEN_PROXIMITY_FT = 31;

/**
 * RE-MEASURED 2026-08-18 — the gate is alive; the rule still emits nothing;
 * THAT IS NOT A BUG, AND IT IS NOT A REASON TO MOVE THE THRESHOLD AGAIN.
 *
 * Production still holds 0 rows whose signature contains
 * `long_approach_3putt_cascade`, which reads like the 31 ft recalibration
 * failed. It did not. Measured against `golf_coach_insights`:
 *
 *   players with a leg-1 measure (175+ proximity)   30
 *   players with a leg-2 measure (10-15 ft standing) 20
 *   EVALUABLE ON BOTH LEGS                           18
 *     of those, pass leg 1 (proximity > 31 ft)        4
 *     of those, pass leg 2 (team_pct < 50)            8
 *     pass BOTH                                       0
 *
 * Before 31 ft, leg 1 passed ZERO players and the rule was structurally
 * unfireable. It now passes 4 of 18, so the gate does discriminate.
 *
 * The conjunction is what yields nothing, and at this sample size that is
 * expected: under independence the overlap is 4 x 8 / 18 = 1.78 players, and
 * P(observing 0) = C(10,4)/C(18,4) = 0.069. A ~7% outcome is noise, not
 * counter-evidence — it does NOT show that long-approach dial-in and
 * mid-putt weakness are unrelated, and it does not license widening either
 * gate to "make the rule work". Widening on exactly this reasoning is how the
 * 50 ft threshold survived: a number chosen so a rule would fire, justified
 * afterwards.
 *
 * Re-measure when the evaluable population is materially larger (say 50+
 * players on both legs). Until then, zero firings is the honest output.
 */

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
      title: `Long approaches are leaving long putts`,
      content:
        `When you find the green from 175+ yd you're averaging ${proximity} ft ` +
        `from the hole — past the ${WEAK_ON_GREEN_PROXIMITY_FT} ft line that marks ` +
        `the squad's weakest quartile of long-approach dial-in. Across the roster, ` +
        `a 175+ yd approach that finds the green leaves a 25 ft first putt on ` +
        `average, and 79% of them finish outside 15 ft. That is lag-putt ` +
        `territory, where 3-putts are driven by speed control rather than line ` +
        `(Research doc §4, "Lag Putting (>25 ft) → 3-Putt Avoidance"). You're ` +
        `also converting only ${midPct}% from 10-15 ft. Dialling in the stock ` +
        `200-yd shot shortens the first putt; the lag work is what stops the ` +
        `three.`,
      signature: `long_approach_3putt_cascade`,
      evidence: {
        metric: 'approach_proximity_175_plus_ft',
        metric_label: 'Long approach dial-in (on-green)',
        unit: 'feet',
        your_value: proximity,
        your_value_display: `${proximity} ft`,
        // NOT the Tour 45 ft anchor. See the WEAK_ON_GREEN_PROXIMITY_FT docblock:
        // Tour's ~45 ft is proximity over ALL approaches from the range, misses
        // included, while `proximity_when_hit_feet` is averaged over green-finding
        // shots only. Against that anchor every player this card can fire for —
        // production max 36.3 ft — renders as beating Tour off a long iron. The
        // honest reference is the empirical line the gate itself fires on.
        comparison_value: WEAK_ON_GREEN_PROXIMITY_FT,
        comparison_label: `weak-quartile line (${WEAK_ON_GREEN_PROXIMITY_FT} ft)`,
        comparison_source: 'absolute_target',
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
