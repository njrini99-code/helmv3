/**
 * v3 CourseMgmtGenerator (W23).
 *
 * Two variants, each one instance:
 *   - 'penalty'    — penalty_rate_per_round from cache.penalty_strokes_per_round
 *   - 'big_number' — double-bogey-or-worse rate, computed from cache hole counts
 *                    (matches the formula in W11's refresh_player_standing RPC).
 *
 * Both variants have v3 standing data populated by W11, and lower-better
 * counterfactual factors in W17's lookup (penalty: 1.5 strokes/penalty;
 * big_number: 0.18 strokes/pp).
 *
 * C3: the cache scalars (penalty_rate / big_number_rate) only RESTATE a number.
 * To make the cards actionable we join golf_holes via the Phase C0 diagnosis
 * helper and decompose the double-or-worse holes by PROXIMATE CAUSE (penalty vs
 * 3-putt vs missed-GIR-no-scramble) and surface the per-hole-number average-to-
 * par leaders ("worst holes"). The cache scalar stays the headline value; these
 * aggregations only fuel the cause-naming + worst-holes prose.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { BaseGenerator } from '@/lib/coachhelm/v3/engine/generator-base';
import { loadStandingForMetric } from '@/lib/coachhelm/v3/standing/loader';
import { loadCompletedHoles, proximateCause } from '@/lib/coachhelm/v3/engine/hole-diagnosis';
import type {
  ComposedContent,
  GeneratorAggregate,
  InsightCategory,
  InsightPriority,
  MetricId,
} from '@/lib/coachhelm/v3/engine/types';

export type CourseMgmtVariant = 'penalty' | 'big_number';

const VARIANT_TO_METRIC_ID: Record<CourseMgmtVariant, MetricId> = {
  penalty: 'penalty_rate_per_round',
  big_number: 'big_number_rate',
};

interface CourseMgmtAggregate extends GeneratorAggregate {
  variant: CourseMgmtVariant;
  /** Convenience: same as playerValue, named for downstream clarity. */
  metric_value: number;
  rounds_played: number;
  /**
   * Realistic baseline the priority + prose anchor to (cm-1): the college/division
   * COHORT average (golf_player_standing.level_avg) when populated, else the PGA
   * value as the fallback ceiling. This is the SAME target the BaseGenerator feeds
   * the counterfactual (compute.ts: cohort-primary, Tour-ceiling), so an at/below-
   * cohort player no longer gets a HIGH "3× Tour" card whose counterfactual is 0.
   * Null only when no standing row exists yet (cold-start) → falls back to the raw
   * PGA anchors below, unchanged from the pre-cm-1 behavior.
   */
  anchor_value: number | null;
  /** True when anchor_value came from the cohort (level_avg), not the PGA fallback. */
  anchor_is_cohort: boolean;
  /** Of this player's double-plus holes, the % whose proximate cause was a penalty. */
  cause_penalty_pct: number;
  /** % whose proximate cause was a missed GIR with no scramble. */
  cause_missed_gir_pct: number;
  /** % whose proximate cause was a 3-putt (or worse). */
  cause_three_putt_pct: number;
  /** Top per-hole-number average-to-par offenders (n>=3 plays), worst first. */
  worst_holes: Array<{ hole_number: number; avg_to_par: number; n: number }>;
}

export class CourseMgmtGenerator extends BaseGenerator<CourseMgmtAggregate> {
  readonly name = 'CourseMgmtGenerator';
  readonly insightType = 'course_management';
  readonly category: InsightCategory = 'course_management';
  readonly minSampleN = 5;

  readonly metricId: MetricId;
  readonly variant: CourseMgmtVariant;

  constructor(playerId: string, variant: CourseMgmtVariant) {
    super(playerId);
    this.variant = variant;
    this.metricId = VARIANT_TO_METRIC_ID[variant];
  }

  async aggregate(): Promise<CourseMgmtAggregate | null> {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('golf_player_stats_cache')
      .select(
        'rounds_played, penalty_strokes_per_round, eagles, birdies, pars, bogeys, double_bogeys, triple_plus',
      )
      .eq('player_id', this.playerId)
      .maybeSingle();
    if (error || !data) return null;
    const roundsPlayed = data.rounds_played ?? 0;

    let value: number | null = null;
    if (this.variant === 'penalty') {
      value = data.penalty_strokes_per_round !== null
        ? Number(data.penalty_strokes_per_round)
        : null;
    } else {
      // big_number_rate = 100 * (doubles + triples) / total_scored_holes
      const eagles = Number(data.eagles ?? 0);
      const birdies = Number(data.birdies ?? 0);
      const pars = Number(data.pars ?? 0);
      const bogeys = Number(data.bogeys ?? 0);
      const doubles = Number(data.double_bogeys ?? 0);
      const triples = Number(data.triple_plus ?? 0);
      const total = eagles + birdies + pars + bogeys + doubles + triples;
      if (total > 0) {
        value = (100 * (doubles + triples)) / total;
      }
    }
    if (value === null || !Number.isFinite(value)) return null;

    // C3: decompose the big numbers by proximate cause + find worst holes. The
    // cache scalar stays playerValue; this only fuels the cause-naming prose.
    const holes = await loadCompletedHoles(this.playerId);
    let penaltyN = 0, missedGirN = 0, threePuttN = 0, doublePlusN = 0;
    const byHole = new Map<number, { sum: number; n: number }>();
    for (const h of holes) {
      if (h.score === null) continue;
      const over = h.score - h.par;
      // Per-hole-number avg-to-par for worst-holes (all holes, not just doubles).
      const slot = byHole.get(h.hole_number) ?? { sum: 0, n: 0 };
      slot.sum += over;
      slot.n += 1;
      byHole.set(h.hole_number, slot);
      // Proximate-cause split over double-plus holes only.
      if (over >= 2) {
        doublePlusN += 1;
        switch (proximateCause(h)) {
          case 'penalty': penaltyN += 1; break;
          case 'three_putt': threePuttN += 1; break;
          case 'missed_gir_no_scramble': missedGirN += 1; break;
          default: break;
        }
      }
    }
    const cpct = (k: number) => (doublePlusN > 0 ? (100 * k) / doublePlusN : 0);
    const worstHoles = Array.from(byHole.entries())
      .filter(([, v]) => v.n >= 3)
      .map(([hole_number, v]) => ({ hole_number, avg_to_par: v.sum / v.n, n: v.n }))
      .sort((a, b) => b.avg_to_par - a.avg_to_par || a.hole_number - b.hole_number)
      .slice(0, 2);

    // cm-1: anchor the card's priority + prose to the SAME baseline the
    // counterfactual measures the gap to — the cohort (level_avg) when present,
    // else the PGA value. Cold-start (no standing row) leaves anchor_value null
    // and composeContent falls back to the raw PGA anchors.
    const standing = await loadStandingForMetric(this.playerId, this.metricId);
    const cohort = standing?.level_avg ?? null;
    const anchorIsCohort = cohort !== null && Number.isFinite(cohort);
    const anchorValue = anchorIsCohort
      ? cohort
      : standing && Number.isFinite(standing.pga_value)
        ? standing.pga_value
        : null;

    return {
      sampleN: roundsPlayed,
      playerValue: value,
      metric_value: value,
      variant: this.variant,
      rounds_played: roundsPlayed,
      anchor_value: anchorValue,
      anchor_is_cohort: anchorIsCohort,
      cause_penalty_pct: cpct(penaltyN),
      cause_missed_gir_pct: cpct(missedGirN),
      cause_three_putt_pct: cpct(threePuttN),
      worst_holes: worstHoles,
    };
  }

  /**
   * Severity anchored to the realistic baseline the counterfactual uses (cm-1):
   * the cohort (level_avg) when present, else the PGA value, else the hard-coded
   * PGA default. `highMargin`/`medMargin` are the over-anchor margins (in the
   * metric's unit) at which the gap escalates. An at/below-anchor player is `low`
   * — never a HIGH "3× Tour" card whose counterfactual is 0.
   */
  private anchoredPriority(
    agg: CourseMgmtAggregate,
    pgaDefault: number,
    medMargin: number,
    highMargin: number,
  ): InsightPriority {
    const anchor = agg.anchor_value ?? pgaDefault;
    const over = agg.metric_value - anchor; // lower_better: positive = worse than anchor
    if (over > highMargin) return 'high';
    if (over > medMargin) return 'medium';
    return 'low';
  }

  composeContent(agg: CourseMgmtAggregate): ComposedContent {
    const r1 = (x: number) => (Math.round(x * 10) / 10).toString();
    const worstClause =
      agg.worst_holes.length > 0
        ? ` Your highest-scoring holes: ` +
          agg.worst_holes
            .map((w) => `hole ${w.hole_number} (+${w.avg_to_par.toFixed(1)}/play over ${w.n} plays)`)
            .join(', ') +
          `.`
        : '';
    // Dominant proximate cause among the double-plus holes.
    const causes: Array<{ key: string; pct: number; rank: number }> = [
      { key: 'three_putt', pct: agg.cause_three_putt_pct, rank: 0 },
      { key: 'penalty', pct: agg.cause_penalty_pct, rank: 1 },
      { key: 'missed_gir_no_scramble', pct: agg.cause_missed_gir_pct, rank: 2 },
      // Deterministic tiebreak on a stable rank so equal shares don't flip the
      // named dominant cause across engines (mirrors the worst-holes tiebreak).
    ].sort((a, b) => b.pct - a.pct || a.rank - b.rank);
    const top = causes[0];
    const CAUSE_LABEL: Record<string, string> = {
      three_putt: '3-putts',
      penalty: 'penalties',
      missed_gir_no_scramble: 'missed greens you couldn’t get up-and-down',
    };
    const CAUSE_ACTION: Record<string, string> = {
      three_putt: 'lag-putt drills from 25+ ft are the fastest fix for these',
      penalty: 'pick a conservative line / bail-out target off the tee on these holes',
      missed_gir_no_scramble: 'short-game reps from the typical miss-side will stop the bleed',
    };
    const causeClause =
      top && top.pct > 0
        ? ` ${r1(top.pct)}% of your double-or-worse holes trace to ${CAUSE_LABEL[top.key]} — ${CAUSE_ACTION[top.key]}.`
        : '';

    if (agg.variant === 'penalty') {
      const valueDisp = agg.metric_value.toFixed(1);
      const anchorClause = agg.anchor_is_cohort && agg.anchor_value !== null
        ? `College players in our data average ~${agg.anchor_value.toFixed(1)} (PGA Tour ~0.3)`
        : `PGA Tour is ~0.3; top college teams stay under 0.5`;
      return {
        title: `Penalty strokes: ${valueDisp} per round`,
        content:
          `Across your last ${agg.rounds_played} rounds you're averaging ` +
          `${valueDisp} penalty strokes per round. ${anchorClause}.` +
          causeClause + worstClause +
          ` Every penalty avoided is worth ~1.5 strokes per round.`,
        // Severity anchored to the cohort the counterfactual uses (cm-1): >0.3 over
        // anchor is high, >0.1 over medium, at/under the anchor low. PGA fallback
        // (0.3) keeps the pre-cm-1 thresholds (0.6 high / 0.3 medium) at cold-start.
        priority: this.anchoredPriority(agg, 0.3, 0, 0.3),
        signature: `course_management:penalty_rate`,
        evidence: {
          metric: this.metricId,
          metric_label: 'Penalties per Round',
          unit: 'count',
          your_value: agg.metric_value,
          your_value_display: valueDisp,
          comparison_value: 0.3,
          comparison_label: 'PGA Tour avg',
          comparison_source: 'pga_baseline',
          sample_n: agg.rounds_played,
          window_days: 90,
          window_start: '',
          window_end: '',
          strokes_impact: 0,
          strokes_impact_method: 'peer_delta',
          confidence: 0,
          confidence_factors: {
            sample_adequacy: Math.min(agg.rounds_played / 30, 1),
            recency: 1.0,
            variance: 0.5,
          },
        },
      };
    }

    // big_number variant
    const valueDisp = `${agg.metric_value.toFixed(1)}%`;
    const anchorClause = agg.anchor_is_cohort && agg.anchor_value !== null
      ? `College players in our data average ~${agg.anchor_value.toFixed(1)}% (PGA Tour ~2%)`
      : `PGA Tour is ~2%`;
    return {
      title: `Double bogey-or-worse rate: ${valueDisp}`,
      content:
        `Across your last ${agg.rounds_played} rounds, ${valueDisp} of holes ` +
        `ended in double bogey or worse. ${anchorClause}. Per Research doc §4 ` +
        `this is the #1 separator between 70s and 80s rounds.` +
        causeClause + worstClause,
      // Severity anchored to the cohort the counterfactual uses (cm-1): >2pp over
      // anchor is high, >0.5pp over medium, at/under the anchor low. PGA fallback
      // (2%) keeps the pre-cm-1 thresholds (4% high / 2% medium) at cold-start.
      priority: this.anchoredPriority(agg, 2, 0, 2),
      signature: `course_management:big_number`,
      evidence: {
        metric: this.metricId,
        metric_label: 'Double Bogey-or-Worse Rate',
        unit: 'percent',
        your_value: agg.metric_value,
        your_value_display: valueDisp,
        comparison_value: 2,
        comparison_label: 'PGA Tour avg',
        comparison_source: 'pga_baseline',
        sample_n: agg.rounds_played,
        window_days: 90,
        window_start: '',
        window_end: '',
        strokes_impact: 0,
        strokes_impact_method: 'peer_delta',
        confidence: 0,
        confidence_factors: {
          sample_adequacy: Math.min(agg.rounds_played / 30, 1),
          recency: 1.0,
          variance: 0.5,
        },
      },
    };
  }
}
