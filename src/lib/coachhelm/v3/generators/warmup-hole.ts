/**
 * v3 WarmupHoleGenerator (W24).
 *
 * Aggregates the player's avg (score - par) on hole 1 vs holes 2-18 over
 * the last 90 days. Positive delta = "warmup tax" — opening hole plays
 * harder than the round average.
 *
 * Standing populated by `refresh_player_standing_round_metrics` (W24-prep
 * companion RPC). PGA reference = 0.1 strokes per Research doc §9.
 *
 * DOUBLE-SURFACE NOTE (warmup-hole / front-9-starter): this generator
 * (metric `opening_hole_delta`, hole 1, category 'pressure') and the
 * `front-9-starter` composite (same `opening_hole_delta`, holes 1-3, category
 * 'scoring') describe the SAME opening-stretch leak in two themes. There is no
 * cross-metric dedup between them, so a slow-start player can see the leak twice.
 * CROSS-FILE DEPENDENCY (composites / assembler owner): the cross-theme
 * suppression (pick one home, or dedup cross-theme rows by metric_id) is owned
 * by the composite synthesis / themes assembler — not changeable from this
 * generator. Flagged here so the overlap is documented at the source.
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

interface WarmupHoleAggregate extends GeneratorAggregate {
  hole1_avg: number;
  rest_avg: number;
  rounds_with_hole1: number;
}

export class WarmupHoleGenerator extends BaseGenerator<WarmupHoleAggregate> {
  readonly name = 'WarmupHoleGenerator';
  readonly insightType = 'warmup_hole';
  readonly category: InsightCategory = 'pressure';
  readonly minSampleN = 5; // rounds with a hole-1 entry

  readonly metricId: MetricId = 'opening_hole_delta';

  async aggregate(): Promise<WarmupHoleAggregate | null> {
    const supabase = createAdminClient();
    const since = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);

    // Pull this player's completed rounds + the holes for each. Bucket
    // hole 1 vs holes 2-18 in TS.
    const { data: rounds, error: roundsErr } = await fromUntyped(supabase, 'golf_rounds')
      .select('id')
      .eq('player_id', this.playerId)
      .eq('status', 'completed')
      .gte('round_date', since) as {
        data: Array<{ id: string }> | null;
        error: { message: string } | null;
      };
    if (roundsErr || !rounds || rounds.length === 0) return null;
    const roundIds = rounds.map((r) => r.id);

    const { data: holes, error: holesErr } = await fromUntyped(supabase, 'golf_holes')
      .select('round_id, hole_number, par, score')
      .in('round_id', roundIds) as {
        data: Array<{
          round_id: string;
          hole_number: number | null;
          par: number | null;
          score: number | null;
        }> | null;
        error: { message: string } | null;
      };
    if (holesErr || !holes) return null;

    let hole1Sum = 0;
    let hole1N = 0;
    const hole1Rounds = new Set<string>();
    let restSum = 0;
    let restN = 0;
    for (const h of holes) {
      if (h.score === null || h.par === null || h.hole_number === null) continue;
      const delta = Number(h.score) - Number(h.par);
      if (!Number.isFinite(delta)) continue;
      if (h.hole_number === 1) {
        hole1Sum += delta;
        hole1N += 1;
        hole1Rounds.add(h.round_id);
      } else if (h.hole_number >= 2 && h.hole_number <= 18) {
        restSum += delta;
        restN += 1;
      }
    }

    if (hole1N === 0 || restN === 0) return null;
    const hole1Avg = hole1Sum / hole1N;
    const restAvg = restSum / restN;
    const delta = hole1Avg - restAvg;

    return {
      sampleN: hole1Rounds.size,
      playerValue: delta,
      hole1_avg: hole1Avg,
      rest_avg: restAvg,
      rounds_with_hole1: hole1Rounds.size,
    };
  }

  composeContent(agg: WarmupHoleAggregate): ComposedContent {
    const deltaDisp =
      agg.playerValue > 0 ? `+${agg.playerValue.toFixed(2)}` : agg.playerValue.toFixed(2);
    const absDelta = Math.abs(agg.playerValue).toFixed(2);
    const direction = agg.playerValue > 0 ? 'harder' : 'easier';
    const hole1Disp = formatHoleDelta(agg.hole1_avg);
    const restDisp = formatHoleDelta(agg.rest_avg);

    const title = `Opening hole gap: ${deltaDisp} strokes vs round avg`;
    const content =
      `Across your last ${agg.rounds_with_hole1} rounds, hole 1 plays ` +
      `${absDelta} strokes ${direction} than holes 2-18 ` +
      `(hole 1 = ${hole1Disp}/hole; rest of round = ${restDisp}/hole). ` +
      `Tour avg is ~0.1 strokes (Research doc §9). The standing card ` +
      `below shows where you sit vs PGA + your team.`;

    return {
      title,
      content,
      // Opening-hole gap vs the ~0.1 PGA tax: at/under is fine; a large opener tax escalates.
      priority: agg.playerValue <= 0.1 ? 'low' : agg.playerValue <= 0.4 ? 'medium' : 'high',
      signature: `warmup_hole:hole_1`,
      evidence: {
        metric: this.metricId,
        metric_label: 'Opening Hole Delta',
        unit: 'strokes',
        your_value: agg.playerValue,
        your_value_display: deltaDisp,
        comparison_value: 0.1,
        comparison_label: 'PGA Tour opening-hole tax',
        comparison_source: 'pga_baseline',
        sample_n: agg.rounds_with_hole1,
        window_days: 90,
        window_start: '',
        window_end: '',
        strokes_impact: 0,
        strokes_impact_method: 'peer_delta',
        confidence: 0,
        confidence_factors: {
          sample_adequacy: Math.min(agg.rounds_with_hole1 / 20, 1),
          recency: 1.0,
          variance: 0.5,
        },
      },
    };
  }
}

function formatHoleDelta(v: number): string {
  if (v > 0) return `+${v.toFixed(2)}`;
  if (v < 0) return v.toFixed(2);
  return 'E';
}
