/**
 * v3 PuttBiasGenerator (W22).
 *
 * Diagnostic — reads putt-make-% by break direction from
 * golf_player_stats_cache and emits ONE insight about the dominant
 * weakness. No PGA standing exists for putt-bias metrics (per-player
 * tendency, not a tour benchmark), so we set requiresStanding=false
 * and ship without the StandingBar.
 *
 * Cache columns used (per W11 prod schema verification):
 *   - putt_make_pct_left_to_right  (left-to-right break putts)
 *   - putt_make_pct_right_to_left  (right-to-left break putts)
 *   - putt_make_pct_straight       (straight putts)
 *
 * The "bias" surfaced is the LARGEST make-% gap vs the player's own
 * straight-putt baseline — that's the direction the player struggles
 * with most.
 *
 * NOTE: the v3 metric_ids `putt_miss_bias_<dir>_pct` are nominally
 * about MISS direction (high/low/left/right). We map L→R / R→L break
 * struggle to `putt_miss_bias_left_pct` / `putt_miss_bias_right_pct`
 * respectively — closest available mapping until shot-level miss-
 * direction aggregates land.
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

type BreakDirection = 'left' | 'right' | 'straight';

interface PuttBiasAggregate extends GeneratorAggregate {
  weakest_direction: BreakDirection;
  straight_pct: number;
  weakest_pct: number;
  rounds_played: number;
}

const DIR_TO_METRIC_ID: Record<Exclude<BreakDirection, 'straight'>, MetricId> = {
  left: 'putt_miss_bias_left_pct',
  right: 'putt_miss_bias_right_pct',
};

export class PuttBiasGenerator extends BaseGenerator<PuttBiasAggregate> {
  readonly name = 'PuttBiasGenerator';
  readonly insightType = 'putt_bias';
  readonly category: InsightCategory = 'putting';
  readonly minSampleN = 5;
  protected override readonly requiresStanding = false; // no PGA benchmark exists

  readonly metricId: MetricId;

  constructor(playerId: string, weakestDirection: 'left' | 'right' = 'left') {
    super(playerId);
    this.metricId = DIR_TO_METRIC_ID[weakestDirection];
  }

  async aggregate(): Promise<PuttBiasAggregate | null> {
    const supabase = createAdminClient();
    const { data, error } = await fromUntyped(supabase, 'golf_player_stats_cache')
      .select('rounds_played, putt_make_pct_left_to_right, putt_make_pct_right_to_left, putt_make_pct_straight')
      .eq('player_id', this.playerId)
      .maybeSingle() as {
        data: {
          rounds_played: number | null;
          putt_make_pct_left_to_right: number | null;
          putt_make_pct_right_to_left: number | null;
          putt_make_pct_straight: number | null;
        } | null;
        error: { message: string } | null;
      };
    if (error || !data) return null;

    const straight = normalizePct(data.putt_make_pct_straight);
    const ltr = normalizePct(data.putt_make_pct_left_to_right);
    const rtl = normalizePct(data.putt_make_pct_right_to_left);
    if (straight === null || ltr === null || rtl === null) return null;

    // Weakness = direction with the largest gap below straight
    const ltrGap = straight - ltr;
    const rtlGap = straight - rtl;
    let weakest: BreakDirection;
    let weakest_pct: number;
    if (ltrGap > rtlGap && ltrGap > 1) {
      weakest = 'left';
      weakest_pct = ltr;
    } else if (rtlGap > 1) {
      weakest = 'right';
      weakest_pct = rtl;
    } else {
      weakest = 'straight';
      weakest_pct = straight;
    }

    return {
      sampleN: data.rounds_played ?? 0,
      playerValue: weakest_pct,
      weakest_direction: weakest,
      straight_pct: straight,
      weakest_pct,
      rounds_played: data.rounds_played ?? 0,
    };
  }

  composeContent(agg: PuttBiasAggregate): ComposedContent {
    const dirLabel =
      agg.weakest_direction === 'left'  ? 'left-to-right break' :
      agg.weakest_direction === 'right' ? 'right-to-left break' :
                                          'straight';

    const valueDisp = `${Math.round(agg.weakest_pct)}%`;
    const straightDisp = `${Math.round(agg.straight_pct)}%`;
    const gap = Math.round(agg.straight_pct - agg.weakest_pct);

    const title =
      agg.weakest_direction === 'straight'
        ? `Putting bias check: balanced across directions`
        : `Putting bias: ${dirLabel} putts (${valueDisp})`;

    const content =
      agg.weakest_direction === 'straight'
        ? `Across your last ${agg.rounds_played} rounds your putting is fairly balanced across break directions — no single direction stands out as a weakness.`
        : `Across your last ${agg.rounds_played} rounds you're making ${valueDisp} of ${dirLabel} putts vs ${straightDisp} on straight putts — a ${gap}-point gap. Likely a green-reading bias on that side of the cup; worth flagging during practice rounds.`;

    return {
      title,
      content,
      // A directional bias is a mild, actionable pattern; balanced is a strength.
      priority: agg.weakest_direction === 'straight' ? 'low' : 'medium',
      signature: `putt_bias:${agg.weakest_direction}`,
      evidence: {
        metric: this.metricId,
        metric_label: `Putt break-direction bias`,
        unit: 'percent',
        your_value: agg.weakest_pct,
        your_value_display: valueDisp,
        comparison_value: agg.straight_pct,
        comparison_label: 'Your straight-putt make %',
        comparison_source: 'your_baseline',
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

function normalizePct(v: number | null): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n <= 1 ? n * 100 : n;
}
