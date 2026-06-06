/**
 * v3 ScramblingGenerator (W22).
 *
 * Reads sand_save_percentage from golf_player_stats_cache and emits a
 * scrambling-from-sand insight. PGA standing exists for
 * scrambling_pct_sand (Tour ~50% per Research doc §2), so this
 * generator inherits the default requiresStanding=true.
 *
 * Rough + fairway lie variants are deferred until the cache (or a
 * shot-level aggregator) splits scrambling by lie. Each future variant
 * will be its own instance, same pattern as PuttDistanceGenerator.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { fromUntyped } from '@/lib/supabase/untyped';
import { BaseGenerator } from '@/lib/coachhelm/v3/engine/generator-base';
import type {
  ComposedContent,
  GeneratorAggregate,
  InsightCategory,
  MetricId,
} from '@/lib/coachhelm/v3/engine/types';

type ScramblingLie = 'sand';

interface ScramblingAggregate extends GeneratorAggregate {
  lie: ScramblingLie;
  attempts: number;
  rounds_played: number;
}

const LIE_TO_METRIC_ID: Record<ScramblingLie, MetricId> = {
  sand: 'scrambling_pct_sand',
};

export class ScramblingGenerator extends BaseGenerator<ScramblingAggregate> {
  readonly name = 'ScramblingGenerator';
  readonly insightType = 'scrambling';
  readonly category: InsightCategory = 'short_game';
  readonly minSampleN = 5; // sand ATTEMPTS — a sand-save % off 1-2 bunker shots is noise

  readonly metricId: MetricId;
  readonly lie: ScramblingLie;

  constructor(playerId: string, lie: ScramblingLie = 'sand') {
    super(playerId);
    this.lie = lie;
    this.metricId = LIE_TO_METRIC_ID[lie];
  }

  async aggregate(): Promise<ScramblingAggregate | null> {
    const supabase = createAdminClient();
    const { data, error } = await fromUntyped(supabase, 'golf_player_stats_cache')
      .select('rounds_played, sand_save_percentage, sand_attempts')
      .eq('player_id', this.playerId)
      .maybeSingle() as {
        data: {
          rounds_played: number | null;
          sand_save_percentage: number | null;
          sand_attempts: number | null;
        } | null;
        error: { message: string } | null;
      };
    if (error || !data) return null;
    if (data.sand_save_percentage === null) return null;

    const raw = Number(data.sand_save_percentage);
    const playerValue = raw <= 1 ? raw * 100 : raw;
    const roundsPlayed = data.rounds_played ?? 0;
    const attempts = data.sand_attempts ?? 0;

    return {
      // Gate on bunker ATTEMPTS, not rounds: a player with 5 rounds but only
      // 1-2 greenside-bunker shots shouldn't get a PGA-benchmarked sand-save %.
      sampleN: attempts,
      playerValue,
      lie: this.lie,
      attempts,
      rounds_played: roundsPlayed,
    };
  }

  composeContent(agg: ScramblingAggregate): ComposedContent {
    const valueDisp = `${Math.round(agg.playerValue)}%`;
    const title = `Sand save rate: ${valueDisp}`;
    const content =
      `Across your last ${agg.rounds_played} rounds you converted ` +
      `${valueDisp} of greenside-bunker attempts (${agg.attempts} total). ` +
      `Tour average is ~50%.`;

    return {
      title,
      content,
      // Descriptive sand-save standing row — severity is read off the StandingBar.
      priority: 'low',
      signature: `scrambling:${agg.lie}`,
      evidence: {
        metric: this.metricId,
        metric_label: 'Sand Save %',
        unit: 'percent',
        your_value: agg.playerValue,
        your_value_display: valueDisp,
        comparison_value: 50,
        comparison_label: 'PGA Tour sand save avg',
        comparison_source: 'pga_baseline',
        sample_n: agg.attempts,
        window_days: 90,
        window_start: '',
        window_end: '',
        strokes_impact: 0,
        strokes_impact_method: 'peer_delta',
        confidence: 0,
        confidence_factors: {
          sample_adequacy: Math.min(agg.attempts / 20, 1),
          recency: 1.0,
          variance: 0.5,
        },
      },
    };
  }
}
