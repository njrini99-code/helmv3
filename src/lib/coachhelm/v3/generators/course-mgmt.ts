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
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { BaseGenerator } from '@/lib/coachhelm/v3/engine/generator-base';
import type {
  ComposedContent,
  GeneratorAggregate,
  InsightCategory,
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

    return {
      sampleN: roundsPlayed,
      playerValue: value,
      metric_value: value,
      variant: this.variant,
      rounds_played: roundsPlayed,
    };
  }

  composeContent(agg: CourseMgmtAggregate): ComposedContent {
    if (agg.variant === 'penalty') {
      const valueDisp = agg.metric_value.toFixed(1);
      return {
        title: `Penalty strokes: ${valueDisp} per round`,
        content:
          `Across your last ${agg.rounds_played} rounds you're averaging ` +
          `${valueDisp} penalty strokes per round. PGA Tour is ~0.3; top ` +
          `college teams stay under 0.5. The standing card below shows where ` +
          `you stack up — every penalty avoided is worth ~1.5 strokes per round.`,
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
    return {
      title: `Double bogey-or-worse rate: ${valueDisp}`,
      content:
        `Across your last ${agg.rounds_played} rounds, ${valueDisp} of holes ` +
        `ended in double bogey or worse. PGA Tour is ~2%. Per Research doc §4 ` +
        `this is the #1 separator between 70s and 80s rounds. The standing ` +
        `card below shows your position relative to Tour and your team.`,
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
