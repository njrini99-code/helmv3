/**
 * v3 ParTypeGenerator (W23).
 *
 * Reads cache.par{3,4,5}_average and emits a per-par scoring insight
 * with PGA standing. 3 generator instances cover all 3 par types.
 *
 * All three v3 metric_ids (scoring_par_3/4/5) have standing data
 * populated by W11 from cache columns; counterfactual lookup uses the
 * lookup table from W17 (stroke_impact_per_unit = 4/10/4 holes per round).
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { BaseGenerator } from '@/lib/coachhelm/v3/engine/generator-base';
import type {
  ComposedContent,
  GeneratorAggregate,
  InsightCategory,
  MetricId,
} from '@/lib/coachhelm/v3/engine/types';

export type ParType = 3 | 4 | 5;

const PAR_TO_METRIC_ID: Record<ParType, MetricId> = {
  3: 'scoring_par_3',
  4: 'scoring_par_4',
  5: 'scoring_par_5',
};

const PAR_TO_CACHE_COL: Record<ParType, 'par3_average' | 'par4_average' | 'par5_average'> = {
  3: 'par3_average',
  4: 'par4_average',
  5: 'par5_average',
};

interface ParTypeAggregate extends GeneratorAggregate {
  par: ParType;
  rounds_played: number;
}

export class ParTypeGenerator extends BaseGenerator<ParTypeAggregate> {
  readonly name = 'ParTypeGenerator';
  readonly insightType = 'par_scoring';
  readonly category: InsightCategory = 'scoring';
  readonly minSampleN = 5;

  readonly metricId: MetricId;
  readonly par: ParType;

  constructor(playerId: string, par: ParType) {
    super(playerId);
    this.par = par;
    this.metricId = PAR_TO_METRIC_ID[par];
  }

  async aggregate(): Promise<ParTypeAggregate | null> {
    const supabase = createAdminClient();
    const col = PAR_TO_CACHE_COL[this.par];
    const { data, error } = await supabase
      .from('golf_player_stats_cache')
      .select(`player_id, rounds_played, ${col}`)
      .eq('player_id', this.playerId)
      .maybeSingle();
    if (error || !data) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = (data as any)[col];
    if (raw === null || raw === undefined) return null;
    const value = Number(raw);
    if (!Number.isFinite(value)) return null;
    const roundsPlayed = data.rounds_played ?? 0;
    return {
      sampleN: roundsPlayed,
      playerValue: value,
      par: this.par,
      rounds_played: roundsPlayed,
    };
  }

  composeContent(agg: ParTypeAggregate): ComposedContent {
    const vsPar = agg.playerValue - agg.par;
    const vsParDisp = vsPar > 0 ? `+${vsPar.toFixed(2)}` : vsPar.toFixed(2);
    const valueDisp = agg.playerValue.toFixed(2);

    const title = `Par ${agg.par} scoring: ${valueDisp} (${vsParDisp} vs par)`;
    const content =
      `Across your last ${agg.rounds_played} rounds you average ${valueDisp} ` +
      `on par ${agg.par}s — ${vsParDisp} versus par. The standing card below ` +
      `shows where that sits vs PGA Tour and your team.`;

    return {
      title,
      content,
      signature: `par_scoring:par${agg.par}`,
      evidence: {
        metric: this.metricId,
        metric_label: `Par ${agg.par} Scoring`,
        unit: 'strokes',
        your_value: agg.playerValue,
        your_value_display: valueDisp,
        comparison_value: agg.par,
        comparison_label: `Par ${agg.par}`,
        comparison_source: 'absolute_target',
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
