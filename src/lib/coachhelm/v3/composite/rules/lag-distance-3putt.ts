/**
 * Composite rule: lag_distance_3putt (W30.5).
 *
 * Fires when the player has BOTH a weak long-putt insight (15+ ft
 * lag distance — putts that should leave a tap-in) AND a weak short-
 * putt insight (3-5 ft — where the "tap-in" actually has to be made).
 * Classic 3-putt cascade: bad lag → 6-foot comebacker → miss.
 *
 * Uses existing Tier-1 putt_distance insights for two buckets; no ctx.
 *
 * Slice 5b (flag `coachhelm_insight_angles_v1`, passed in as
 * `ctx.counted_families`): the estimated product and the 'Tour ~3%' line
 * go. The rule fires on the two COUNTED angle rows instead — the three-putt
 * chain (`three_putts_per_18`, counted 3-putts vs its benchmark) and the lag
 * leave (`lag_leave_inside_5ft_pct`, lag putts from 30+ ft left inside 5 ft
 * vs the team pool) — and prints their counts. Not estimated; the chain stays
 * an inferred hypothesis (the research doc's "lag distance drives 3-putt
 * rate"). With the flag off the rule is exactly as before.
 */

import type { CompositeRule, CompositeMatch, CompositeContent, EvidenceInsight } from '../types';
import { inBothVoices } from '@/lib/coachhelm/v3/engine/coach-voice';

/** The counted angle rows the Slice 5b path reads (`insight-angles/angle-data.ts`). */
export const COUNTED_THREE_PUTT_METRIC = 'three_putts_per_18';
export const COUNTED_LAG_METRIC = 'lag_leave_inside_5ft_pct';
/** The counted chain's own metric id (never an angle family's, so the support pass reads it as a composite). */
export const COUNTED_CHAIN_METRIC = 'three_putt_lag_chain';

function num(v: unknown): number | null {
  const n = Number(v);
  return v === null || v === undefined || !Number.isFinite(n) ? null : n;
}

/** Slice 5b: both counted rows present, the lag below its team pool and the 3-putts above their benchmark. */
function detectCounted(insights: EvidenceInsight[]): CompositeMatch | null {
  const three = insights.find((i) => i.evidence?.metric === COUNTED_THREE_PUTT_METRIC);
  const lag = insights.find((i) => i.evidence?.metric === COUNTED_LAG_METRIC);
  if (!three || !lag) return null;
  const tYou = num(three.evidence.your_value);
  const tRef = num(three.evidence.comparison_value);
  const lYou = num(lag.evidence.your_value);
  const lRef = num(lag.evidence.comparison_value);
  if (tYou === null || tRef === null || lYou === null || lRef === null) return null;
  if (!(tYou > tRef) || !(lYou < lRef)) return null;
  const sampleN = Math.min(num(three.evidence.sample_n) ?? 0, num(lag.evidence.sample_n) ?? 0);
  if (sampleN < MIN_SOURCE_N) return null;
  return {
    source_insight_ids: [three.id, lag.id],
    signals: {
      counted: true,
      three_per_18: tYou,
      three_ref: tRef,
      three_ref_label: three.evidence.comparison_label ?? '',
      three_ref_source: three.evidence.comparison_source ?? 'team_avg',
      three_strokes: num(three.evidence.strokes_impact) ?? 0,
      lag_display: lag.evidence.your_value_display ?? `${lYou}%`,
      lag_pct: lYou,
      lag_team_pct: lRef,
      sample_n: sampleN,
      window_days: Math.max(num(three.evidence.window_days) ?? 0, num(lag.evidence.window_days) ?? 0),
    },
  };
}

function composeCounted(match: CompositeMatch): CompositeContent {
  const sg = match.signals;
  const three = Number(sg.three_per_18 ?? 0);
  const ref = Number(sg.three_ref ?? 0);
  const lagPct = Number(sg.lag_pct ?? 0);
  const lagTeam = Number(sg.lag_team_pct ?? 0);
  return {
    ...inBothVoices((v) => ({
      title: 'Long lag leaves and 3-putts (counted)',
      content:
        `${v.Player} ${v.pick('3-putt', '3-putts')} ${three.toFixed(1)} times a round vs ${ref.toFixed(1)} for ${String(sg.three_ref_label || 'the benchmark')}, ` +
        `and ${v.your} lag putts from 30+ ft finish inside 5 ft ${String(sg.lag_display)} of the time against ${lagTeam}% for ${v.your} teammates' pooled lag putts. ` +
        `Both are counted from ${v.your} putts, not estimated. Lag distance drives 3-putt rate, so the lag leave is the first thing to work on: ` +
        `lag ladder from 30, 40 and 50 ft, scored on putts finishing inside 5 ft.`,
    })),
    signature: 'lag_distance_3putt:counted',
    evidence: {
      metric: COUNTED_CHAIN_METRIC,
      metric_label: '3-putts per 18 with the lag leave from 30+ ft',
      unit: 'count',
      polarity: 'lower_better',
      your_value: three,
      your_value_display: `${three.toFixed(1)} per round (lag ${lagPct}% inside 5 ft)`,
      comparison_value: ref,
      comparison_label: String(sg.three_ref_label || 'Benchmark'),
      comparison_source: sg.three_ref_source === 'pga_baseline' ? 'pga_baseline' : 'team_avg',
      sample_n: Number(sg.sample_n ?? 0),
      window_days: Number(sg.window_days ?? 0),
      window_start: '',
      window_end: '',
      // The counted 3-putt excess (each 3-putt saved is one stroke); the lag
      // read's own estimate is the same strokes and is not added again.
      strokes_impact: Number(sg.three_strokes ?? 0),
      strokes_impact_method: 'peer_delta',
      confidence: 0.7,
      confidence_factors: { sample_adequacy: 0.8, recency: 1.0, variance: 0.5, factors_measured: false },
      estimated: false,
      causality_level: 'inferred_hypothesis',
    },
  };
}

/** A cascade needs >=5 rounds of BOTH signals; below that it's noise. */
const MIN_SOURCE_N = 5;

/**
 * Absolute-skill floor (lag3putt-2 / PDC-1).
 *
 * `team_pct = PERCENT_RANK()` is 0 for the only/worst row on a tiny team,
 * so a 94.8%-from-3-5ft putter on a team of two gets flagged "weak" on
 * team rank alone. Putt make-% metrics are `higher_better`, so a player
 * is only genuinely weak when their make-% is also below the PGA baseline.
 * Require `player_value < pga_value` (with a small tolerance) so a putter
 * who already beats Tour isn't dragged into a 3-putt-cascade card by a
 * degenerate team percentile. When `pga_value` is missing (legacy/0), fall
 * back to the team-rank gate alone — no regression vs prior behavior.
 */
function belowPgaFloor(i: EvidenceInsight): boolean {
  const standing = i.evidence.standing;
  if (!standing) return true; // no baseline to compare → defer to team gate
  const pga = standing.pga_value;
  if (typeof pga !== 'number' || pga <= 0) return true; // unset baseline
  const player = standing.player_value;
  if (typeof player !== 'number') return true;
  // higher_better: weak means make-% below Tour (1 pt tolerance for noise).
  return player < pga - 1;
}

function isWeakLagPutt(i: EvidenceInsight): boolean {
  if (i.insight_type !== 'putt_distance') return false;
  // Long buckets: anything 15+ ft (the v3 generator ships 15_25ft/25_plus_ft;
  // legacy v2 used 15_20ft/20_plus_ft — accept any of these).
  const sig = i.signature;
  const isLong =
    sig.includes('15_25ft') ||
    sig.includes('25_plus_ft') ||
    sig.includes('15_20ft') ||
    sig.includes('20_plus_ft');
  if (!isLong) return false;
  const teamPct = i.evidence.standing?.team_pct;
  return typeof teamPct === 'number' && teamPct < 40 && belowPgaFloor(i);
}

function isWeakShortPutt(i: EvidenceInsight): boolean {
  if (i.insight_type !== 'putt_distance') return false;
  if (!i.signature.includes('3_5ft')) return false;
  const teamPct = i.evidence.standing?.team_pct;
  return typeof teamPct === 'number' && teamPct < 50 && belowPgaFloor(i);
}

const rule: CompositeRule = {
  id: 'lag_distance_3putt',
  name: 'Lag-distance → 3-putt cascade',
  priority: 'urgent',
  category: 'putting',

  detect(insights, ctx) {
    if (ctx?.counted_families) return detectCounted(insights);
    const lag = insights.find(isWeakLagPutt);
    const short = insights.find(isWeakShortPutt);
    if (!lag || !short) return null;
    const lagMakePct = Number(lag.evidence.your_value ?? 0);
    const shortMakePct = Number(short.evidence.your_value ?? 0);
    // Expected 3-putt rate on 15+ ft looks attributable to the short-putt leak:
    // lag didn't finish (1 − lagMake) AND the comebacker is missed at the player's
    // own 3-5 ft rate (1 − shortMake). Conservative floor — not a measured stat.
    const threePuttRate = (1 - lagMakePct / 100) * (1 - shortMakePct / 100);
    const lagN = Number(lag.evidence.sample_n ?? 0);
    const shortN = Number(short.evidence.sample_n ?? 0);
    const sampleN = Math.min(lagN, shortN);
    if (sampleN < MIN_SOURCE_N) return null;
    return {
      source_insight_ids: [lag.id, short.id],
      signals: {
        lag_signature: lag.signature,
        lag_value: lagMakePct,
        short_value: shortMakePct,
        three_putt_rate: threePuttRate,
        sample_n: sampleN,
      },
    };
  },

  compose(match: CompositeMatch): CompositeContent {
    if (match.signals.counted === true) return composeCounted(match);
    const shortPct = Math.round(Number(match.signals.short_value ?? 0));
    const threePuttRate = Number(match.signals.three_putt_rate ?? 0);
    const threePuttPct = Math.round(threePuttRate * 100);
    return {
      ...inBothVoices((v) => ({
        title: 'Lag putts → 3-putt cascade',
        content:
          `${v.Players} lag putts (15+ ft) aren't finishing inside tap-in range, and ${v.youre} ` +
          `only making ${shortPct}% from 3-5 ft, so an estimated ${threePuttPct}% of ${v.your} ` +
          `long looks are turning into 3-putts. That's the cascade: a long miss leaves ` +
          `a comebacker ${v.your} short stroke isn't closing. Fix the leave first: 30-foot ` +
          `lag drills to a 3-foot circle around the cup (the goal is leave-distance, ` +
          `not make rate), then drill the 3-5 ft comebackers so the second putt stops ` +
          `costing ${v.them} a stroke.`,
      })),
      signature: 'lag_distance_3putt',
      evidence: {
        metric: 'three_putt_chain',
        metric_label: 'Estimated 3-putt rate (15+ ft)',
        unit: 'percent',
        // Not a render-registry id and its name matches no lower-better
        // pattern, so without this a rising 3-putt estimate painted green
        // (repair Package 2; `v3/metrics/registry.ts` already knows the
        // direction for attribution).
        polarity: 'lower_better',
        your_value: threePuttPct,
        your_value_display: `~${threePuttPct}% est. 3-putts`,
        comparison_value: 3,
        comparison_label: 'Tour ~3% 3-putt rate',
        comparison_source: 'pga_baseline',
        sample_n: Number(match.signals.sample_n ?? 0),
        window_days: 30,
        window_start: '',
        window_end: '',
        strokes_impact: 0,
        strokes_impact_method: 'peer_delta',
        confidence: 0.7,
        // P0-06: these are STATIC placeholders, not per-round dispersion, so
        // flag them unmeasured. `calcConfidence` (called in upsert) then drops
        // the fabricated recency/variance blend and the synthesis runner's
        // composite normalization calibrates the final score down for an
        // inferred chain. Never the legacy 0.77 over-confident blend.
        confidence_factors: {
          sample_adequacy: 0.8,
          recency: 1.0,
          variance: 0.5,
          factors_measured: false,
        },
        // P0-06: the 3-putt rate is a projection from two independent make-%
        // standings — never a directly measured stat. The cascade itself is a
        // coach HYPOTHESIS (no shot sequence proves lag→comebacker→miss on the
        // same hole), so this is an inferred chain, not an observed one.
        estimated: true,
        causality_level: 'inferred_hypothesis',
      },
    };
  },
};

export default rule;
