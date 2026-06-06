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
import { getCounterfactualConfig } from '@/lib/coachhelm/v3/counterfactual/lookup-tables';
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

  /**
   * Per-par holes-per-round leverage cap (par-type-3). The counterfactual lookup
   * multiplies the per-par gap by 4/10/4 holes/round, which lets the par-4 family
   * (×10) project the whole-round scoring gap onto one descriptive decomposition
   * row and dominate the top-3. Per-par scoring is NOT an independent additive
   * leak — improving par-4 average IS improving overall scoring, already captured
   * by SG/overall. So the generator declares a strokes_impact CAPPED at the
   * per-par ceiling (lookup `max_strokes_saved_per_round`) and keeps the card
   * descriptive (priority never escalated past medium from this row).
   *
   * CROSS-FILE DEPENDENCY: the AUTHORITATIVE leverage cap belongs in
   * counterfactual/compute.ts (counterfactual owner) — it must apply each
   * metric's `max_strokes_saved_per_round` to `strokes_saved_per_round` so the
   * BaseGenerator's counterfactual backfill + leveragePriorityFloor stop reading
   * the uncapped ×10 value. This generator-side cap only bounds the value the
   * row itself OWNS; the base currently overwrites it with the uncapped
   * counterfactual until compute.ts lands the ceiling.
   */
  private cappedDiagnosticStrokes(vsPar: number): number {
    const cfg = getCounterfactualConfig(this.metricId);
    if (!cfg) return 0;
    // Only an OVER-par average is "costing" strokes (lower_better metric).
    const overPar = Math.max(0, vsPar);
    const raw = overPar * cfg.stroke_impact_per_unit;
    const ceiling = cfg.max_strokes_saved_per_round ?? raw;
    return Math.min(raw, ceiling);
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

    const cappedStrokes = this.cappedDiagnosticStrokes(vsPar);

    return {
      title,
      content,
      // Descriptive par-scoring standing row — severity is read off the StandingBar.
      // Kept descriptive (never high) so the ×10 par-4 leverage can't dominate the
      // top-3; the StandingBar carries the real positional severity.
      priority: 'low',
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
        // Capped at the per-par ceiling (par-type-3) — see cappedDiagnosticStrokes.
        // The base overwrites this from the counterfactual until compute.ts applies
        // the same ceiling (cross-file dependency noted there).
        strokes_impact: cappedStrokes,
        strokes_impact_method: 'rough_estimate',
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
