/**
 * Composite rule: short_approach_proximity_gap (W30.5).
 *
 * Master plan Part IX.2 rule #4 (renamed from "Wedge proximity gap"
 * for the 3-bucket model). Fires when 50-125 yd approach proximity is
 * poor AND scrambling around the green is also weak — the short-game
 * leak is bigger than either insight alone suggests.
 *
 * Pure insight composite — no ctx needed.
 *
 * Basis note (repair Package 2): the proximity here is ON-GREEN-ONLY
 * (`detail.proximity_when_hit_feet` — misses are not in the average). A Tour
 * proximity figure includes every approach, so it is a different quantity and
 * is NOT used as the comparator; `approach-miss.ts` dropped the same anchor
 * for the same reason. The comparator is the rule's own firing threshold,
 * labelled as an estimated coaching target, and `polarity` is stamped so the
 * tone reader does not fall back to the registry's feet-proximity entry.
 *
 * Slice 5b (flag `coachhelm_insight_angles_v1`, passed in as
 * `ctx.counted_families`): the WHAT moves to the counted SG-per-approach
 * row for 50–125 yd (`approach_sg_per_shot_50_125`, hits and misses, vs the
 * teammates' pooled approaches), and the 22 ft Tour-class target goes.
 * Greens hit and proximity are carried from that row as drivers. With the
 * flag off the rule is exactly as before.
 */

import type { CompositeRule, CompositeMatch, CompositeContent, EvidenceInsight } from '../types';

/** The counted SG-per-approach row for 50–125 yd (`insight-angles/approach-sg.ts`). */
export const COUNTED_SHORT_APPROACH_METRIC = 'approach_sg_per_shot_50_125';
/** The counted rewrite's own metric id (never an angle family's). */
export const COUNTED_SHORT_APPROACH_CHAIN_METRIC = 'short_approach_sg_scramble_chain';

function num(v: unknown): number | null {
  const n = Number(v);
  return v === null || v === undefined || !Number.isFinite(n) ? null : n;
}

function detectCounted(insights: EvidenceInsight[]): CompositeMatch | null {
  const approach = insights.find((i) => i.evidence?.metric === COUNTED_SHORT_APPROACH_METRIC);
  const scramble = insights.find(isWeakScrambling);
  if (!approach || !scramble) return null;
  const you = num(approach.evidence.your_value);
  const team = num(approach.evidence.comparison_value);
  if (you === null || team === null || !(you < team)) return null;
  const detail = (approach.evidence.detail ?? {}) as {
    drivers?: { green_pct?: number | null; proximity_ft?: number | null };
    team_drivers?: { green_pct?: number | null; proximity_ft?: number | null };
    strokes_per_round?: number | null;
  };
  return {
    source_insight_ids: [approach.id, scramble.id],
    signals: {
      counted: true,
      sg_you: you,
      sg_team: team,
      team_label: approach.evidence.comparison_label ?? "Teammates' pooled approaches",
      strokes: num(approach.evidence.strokes_impact) ?? 0,
      green_pct: detail.drivers?.green_pct ?? null,
      team_green_pct: detail.team_drivers?.green_pct ?? null,
      proximity_ft: detail.drivers?.proximity_ft ?? null,
      team_proximity_ft: detail.team_drivers?.proximity_ft ?? null,
      scramble_pct: Number(scramble.evidence.your_value ?? 0),
      sample_n: Math.min(Number(approach.evidence.sample_n ?? 0), Number(scramble.evidence.sample_n ?? 0)),
      window_days: Math.max(num(approach.evidence.window_days) ?? 0, num(scramble.evidence.window_days) ?? 0),
    },
  };
}

function composeCounted(match: CompositeMatch): CompositeContent {
  const sg = match.signals;
  const you = Number(sg.sg_you ?? 0);
  const team = Number(sg.sg_team ?? 0);
  const gap = team - you;
  const scramble = Math.round(Number(sg.scramble_pct ?? 0));
  const parts: string[] = [];
  if (sg.green_pct !== null && sg.green_pct !== undefined) {
    parts.push(`you found the green ${sg.green_pct}% of the time (team ${sg.team_green_pct ?? 'n/a'}%)`);
  }
  if (sg.proximity_ft !== null && sg.proximity_ft !== undefined) {
    parts.push(`on the green you were ${sg.proximity_ft} ft from the hole on average (team ${sg.team_proximity_ft ?? 'n/a'} ft)`);
  }
  const drivers = parts.length ? ` ${parts.join('; ').replace(/^./, (c) => c.toUpperCase())}.` : '';
  return {
    title: 'Short approaches + scrambling are stacking up',
    content:
      `From 50–125 yd you lose ${gap.toFixed(2)} strokes per approach against your teammates' pooled approaches (hits and misses counted).${drivers} ` +
      `When you miss the green you save par ${scramble}% of the time. The two stack: a long first putt and a weak recovery both feed bogey. ` +
      `Wedge distance-control reps from 50–125 yd first, then re-check the scrambling rate.`,
    signature: 'short_approach_proximity_gap:counted',
    evidence: {
      metric: COUNTED_SHORT_APPROACH_CHAIN_METRIC,
      metric_label: 'Strokes gained per approach, 50–125 yd, with scrambling',
      unit: 'strokes',
      polarity: 'higher_better',
      your_value: you,
      your_value_display: `${you >= 0 ? '+' : ''}${you.toFixed(2)} per approach`,
      comparison_value: team,
      comparison_label: String(sg.team_label),
      comparison_source: 'team_avg',
      sample_n: Number(sg.sample_n ?? 0),
      window_days: Number(sg.window_days ?? 0),
      window_start: '',
      window_end: '',
      // The counted SG gap a round from the approach row; scrambling is not added.
      strokes_impact: Number(sg.strokes ?? 0),
      strokes_impact_method: 'sg_baseline',
      confidence: 0.7,
      confidence_factors: { sample_adequacy: 0.8, recency: 1.0, variance: 0.5, factors_measured: false },
      estimated: false,
      causality_level: 'inferred_hypothesis',
    },
  };
}

/** On-green proximity (feet) for an approach_miss insight. `evidence.your_value`
 *  is the green-hit PERCENT post the reach-vs-dial-in redesign; the real
 *  proximity lives in `evidence.detail`. NaN when no reliable proximity. */
function approachProximityFeet(i: EvidenceInsight): number {
  const detail = i.evidence.detail as { proximity_when_hit_feet?: number | null } | undefined;
  const prox = detail?.proximity_when_hit_feet;
  return typeof prox === 'number' && Number.isFinite(prox) ? prox : NaN;
}

/** On-green leave (feet) from 50-125 yd that a college player should dial in
 *  under. A coaching target, not a measured population average — it ships as
 *  `estimated_target`. */
const DIAL_IN_TARGET_FT = 22;

function isWeakShortApproach(i: EvidenceInsight): boolean {
  if (i.insight_type !== 'approach_miss') return false;
  if (!i.signature.includes('50_125ft')) return false;
  // > DIAL_IN_TARGET_FT on-green-when-hit is the dial-in leak. Requires a real
  // proximity (≥ MIN_GREENS hit).
  return approachProximityFeet(i) > DIAL_IN_TARGET_FT;
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

  detect(insights, ctx) {
    if (ctx?.counted_families) return detectCounted(insights);
    const approach = insights.find(isWeakShortApproach);
    const scramble = insights.find(isWeakScrambling);
    if (!approach || !scramble) return null;
    return {
      source_insight_ids: [approach.id, scramble.id],
      signals: {
        approach_proximity_ft: approachProximityFeet(approach),
        scramble_pct: Number(scramble.evidence.your_value ?? 0),
        // Honest floor: a composite is only as well-evidenced as its
        // thinnest source. Mirrors lag-distance-3putt.ts:78-81.
        sample_n: Math.min(
          Number(approach.evidence.sample_n ?? 0),
          Number(scramble.evidence.sample_n ?? 0),
        ),
      },
    };
  },

  compose(match: CompositeMatch): CompositeContent {
    if (match.signals.counted === true) return composeCounted(match);
    const proximity = Math.round(Number(match.signals.approach_proximity_ft ?? 0));
    const scramble = Math.round(Number(match.signals.scramble_pct ?? 0));
    return {
      title: 'Short approaches + scrambling are stacking up',
      content:
        `From 50-125 yd, the approaches that hit the green are finishing ` +
        `${proximity} ft from the hole on average (on-green only; dial-in ` +
        `target ~${DIAL_IN_TARGET_FT} ft, estimated), and you are saving par ` +
        `${scramble}% of the time when you miss. The two stack: a long first ` +
        `putt and a weak recovery both feed bogey. Check whether the long leaves ` +
        `share a club or a yardage (full swing vs partial wedge) before naming ` +
        `the cause. Recommended: wedge distance-control reps to a 20-ft circle ` +
        `first, then re-check the scrambling rate.`,
      signature: 'short_approach_proximity_gap',
      evidence: {
        metric: 'approach_proximity_50_125ft',
        metric_label: 'Short approach + scrambling',
        unit: 'feet',
        polarity: 'lower_better',
        your_value: proximity,
        your_value_display: `${proximity} ft avg (on green)`,
        comparison_value: DIAL_IN_TARGET_FT,
        comparison_label: `Dial-in target ~${DIAL_IN_TARGET_FT} ft (est., on-green only)`,
        comparison_source: 'estimated_target',
        sample_n: Number(match.signals.sample_n ?? 0),
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
