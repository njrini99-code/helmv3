/**
 * v3 PressureGapGenerator (W24).
 *
 * Aggregates the player's avg score-to-par on tournament+qualifier rounds
 * vs practice rounds over the last 90 days. Positive delta = player
 * scores higher (worse) under competitive pressure.
 *
 * Standing populated by `refresh_player_standing_round_metrics` (W24-prep
 * companion RPC). PGA reference = 0.5 strokes per Research doc §9
 * (Hickman & Metz; college 2-5 typical).
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

interface PressureGapAggregate extends GeneratorAggregate {
  practice_avg: number;
  competitive_avg: number;
  practice_count: number;
  competitive_count: number;
}

export class PressureGapGenerator extends BaseGenerator<PressureGapAggregate> {
  readonly name = 'PressureGapGenerator';
  readonly insightType = 'pressure_gap';
  readonly category: InsightCategory = 'pressure';
  readonly minSampleN = 5; // combined rounds total

  readonly metricId: MetricId = 'practice_tournament_delta';

  async aggregate(): Promise<PressureGapAggregate | null> {
    const supabase = createAdminClient();
    // Pull last 90 days of completed rounds for this player; bucket in TS.
    const since = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
    const { data, error } = await fromUntyped(supabase, 'golf_rounds')
      .select('round_type, score_to_par')
      .eq('player_id', this.playerId)
      .eq('status', 'completed')
      .gte('round_date', since) as {
        data: Array<{ round_type: string | null; score_to_par: number | null }> | null;
        error: { message: string } | null;
      };
    if (error || !data) return null;

    let practiceSum = 0;
    let practiceN = 0;
    let competitiveSum = 0;
    let competitiveN = 0;
    for (const r of data) {
      if (r.score_to_par === null || r.score_to_par === undefined) continue;
      const v = Number(r.score_to_par);
      if (!Number.isFinite(v)) continue;
      if (r.round_type === 'practice') {
        practiceSum += v;
        practiceN += 1;
      } else if (r.round_type === 'tournament' || r.round_type === 'qualifier') {
        competitiveSum += v;
        competitiveN += 1;
      }
    }
    if (practiceN === 0 || competitiveN === 0) return null;
    const practiceAvg = practiceSum / practiceN;
    const competitiveAvg = competitiveSum / competitiveN;
    const delta = competitiveAvg - practiceAvg;

    return {
      sampleN: practiceN + competitiveN,
      playerValue: delta,
      practice_avg: practiceAvg,
      competitive_avg: competitiveAvg,
      practice_count: practiceN,
      competitive_count: competitiveN,
    };
  }

  composeContent(agg: PressureGapAggregate): ComposedContent {
    const deltaDisp =
      agg.playerValue > 0 ? `+${agg.playerValue.toFixed(1)}` : agg.playerValue.toFixed(1);
    const direction = agg.playerValue > 0 ? 'worse' : 'better';
    const absDelta = Math.abs(agg.playerValue).toFixed(1);
    const practiceDisp = formatVsPar(agg.practice_avg);
    const competitiveDisp = formatVsPar(agg.competitive_avg);

    const title = `Pressure gap: ${deltaDisp} strokes (tournament vs practice)`;
    const content =
      `Across the last 90 days you averaged ${competitiveDisp} in ` +
      `${agg.competitive_count} competitive rounds vs ${practiceDisp} in ` +
      `${agg.practice_count} practice rounds — a ${absDelta}-stroke gap. ` +
      `You play ${direction} when it counts. PGA Tour gap is ~0.5 strokes; ` +
      `college typical is 2-5 (Research doc §9). The standing card below ` +
      `shows where you sit vs PGA + your team.`;

    return {
      title,
      content,
      // Severity from the gap itself (competitive − practice): >0.5 over the PGA
      // reference is a real pressure weakness; at/under practice is fine.
      priority: agg.playerValue > 0.5 ? 'high' : agg.playerValue <= 0 ? 'low' : 'medium',
      signature: `pressure_gap:practice_vs_tournament`,
      evidence: {
        metric: this.metricId,
        metric_label: 'Practice vs Tournament Delta',
        unit: 'strokes',
        your_value: agg.playerValue,
        your_value_display: deltaDisp,
        comparison_value: 0.5,
        comparison_label: 'PGA Tour pressure gap',
        comparison_source: 'pga_baseline',
        sample_n: agg.sampleN,
        window_days: 90,
        window_start: '',
        window_end: '',
        strokes_impact: 0,
        strokes_impact_method: 'peer_delta',
        confidence: 0,
        confidence_factors: {
          sample_adequacy: Math.min(agg.sampleN / 20, 1),
          recency: 1.0,
          variance: 0.5,
        },
      },
    };
  }
}

function formatVsPar(v: number): string {
  if (v > 0) return `+${v.toFixed(1)}`;
  if (v < 0) return v.toFixed(1);
  return 'E';
}
