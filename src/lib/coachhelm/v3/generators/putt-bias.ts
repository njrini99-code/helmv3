/**
 * v3 PuttBiasGenerator (W22; pb-1 shot-level revival 2026-06-06).
 *
 * Diagnostic — emits ONE insight about the player's dominant break-direction
 * putting weakness. No PGA standing exists for putt-bias metrics (per-player
 * tendency, not a tour benchmark), so requiresStanding=false (ships without the
 * StandingBar).
 *
 * pb-1: the original cache columns (`putt_make_pct_left_to_right` /
 * `_right_to_left` / `_straight`) are 100% NULL in prod, so the cache-based
 * generator was DEAD (never emitted). This now aggregates make-% by break
 * direction DIRECTLY from `golf_shots` (shot_type='putting', putt_break +
 * putt_made), which has thousands of populated rows. Window: 90 days, completed
 * rounds only — mirrors the other shot-level generators.
 *
 * `golf_shots.putt_break` values: 'straight' | 'left_to_right' | 'right_to_left'
 * | 'multiple'. 'multiple' (compound break) is excluded from the bias read — it
 * isn't a single directional tendency.
 *
 * The "bias" surfaced is the LARGEST make-% gap vs the player's own straight-putt
 * baseline — the direction the player struggles with most.
 *
 * NOTE: the v3 metric_ids `putt_miss_bias_<dir>_pct` are nominally about MISS
 * direction (high/low/left/right). We map left-to-right / right-to-left BREAK
 * struggle to `putt_miss_bias_left_pct` / `putt_miss_bias_right_pct`
 * respectively — closest available mapping until shot-level miss-direction
 * aggregates land.
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

/** Window for the shot-level putt-break read (days), completed rounds only. */
const WINDOW_DAYS = 90;
/** Minimum putts WITH A SCORED RESULT in a direction before its make-% is read —
 *  a make-% off 1-2 break putts is noise. Applies to straight + each side. */
const MIN_PUTTS_PER_DIRECTION = 8;

/** Per-direction make-% tally from golf_shots. */
interface DirTally {
  attempts: number;
  made: number;
}

function makePct(t: DirTally): number | null {
  return t.attempts > 0 ? (100 * t.made) / t.attempts : null;
}

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
    const since = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString().slice(0, 10);

    // pb-1: read break-direction make-% directly from golf_shots (the cache
    // columns are 100% NULL). First the player's completed rounds in the window…
    const { data: rounds, error: rErr } = await fromUntyped(supabase, 'golf_rounds')
      .select('id')
      .eq('player_id', this.playerId)
      .eq('status', 'completed')
      .gte('round_date', since) as {
        data: Array<{ id: string }> | null;
        error: { message: string } | null;
      };
    if (rErr || !rounds || rounds.length === 0) return null;
    const roundIds = rounds.map((r) => r.id);

    // …then their putts with a recorded break + scored make/miss.
    const { data: putts, error: pErr } = await fromUntyped(supabase, 'golf_shots')
      .select('round_id, putt_break, putt_made')
      .eq('shot_type', 'putting')
      .in('round_id', roundIds) as {
        data: Array<{ round_id: string; putt_break: string | null; putt_made: boolean | null }> | null;
        error: { message: string } | null;
      };
    if (pErr || !putts) return null;

    const straightT: DirTally = { attempts: 0, made: 0 };
    const ltrT: DirTally = { attempts: 0, made: 0 };
    const rtlT: DirTally = { attempts: 0, made: 0 };
    const roundsWithPutts = new Set<string>();
    for (const p of putts) {
      if (p.putt_made === null || p.putt_made === undefined) continue; // unscored
      let t: DirTally | null = null;
      // 'multiple' (compound break) is not a single directional tendency — skip it.
      if (p.putt_break === 'straight') t = straightT;
      else if (p.putt_break === 'left_to_right') t = ltrT;
      else if (p.putt_break === 'right_to_left') t = rtlT;
      if (!t) continue;
      t.attempts += 1;
      if (p.putt_made) t.made += 1;
      roundsWithPutts.add(p.round_id);
    }

    const straight = makePct(straightT);
    const ltr = makePct(ltrT);
    const rtl = makePct(rtlT);
    // Need a stable straight baseline + at least one break side with enough
    // attempts to compare. Below the per-direction floor → not enough signal.
    if (straight === null || straightT.attempts < MIN_PUTTS_PER_DIRECTION) return null;

    const ltrReadable = ltr !== null && ltrT.attempts >= MIN_PUTTS_PER_DIRECTION;
    const rtlReadable = rtl !== null && rtlT.attempts >= MIN_PUTTS_PER_DIRECTION;
    if (!ltrReadable && !rtlReadable) return null;

    // Weakness = the readable break direction with the largest gap below straight.
    const ltrGap = ltrReadable ? straight - (ltr as number) : -Infinity;
    const rtlGap = rtlReadable ? straight - (rtl as number) : -Infinity;
    let weakest: BreakDirection;
    let weakest_pct: number;
    if (ltrGap > rtlGap && ltrGap > 1) {
      weakest = 'left';
      weakest_pct = ltr as number;
    } else if (rtlGap > 1) {
      weakest = 'right';
      weakest_pct = rtl as number;
    } else {
      weakest = 'straight';
      weakest_pct = straight;
    }

    return {
      sampleN: roundsWithPutts.size,
      playerValue: weakest_pct,
      weakest_direction: weakest,
      straight_pct: straight,
      weakest_pct,
      rounds_played: roundsWithPutts.size,
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

    // Stamp the metric from the COMPUTED weakest direction, not the constructor
    // arg. aggregate() derives `weakest` from the data and ignores the arg, so a
    // PuttBiasGenerator(_, 'left') that actually finds 'right' weakest would
    // otherwise stamp evidence.metric=…_left_pct while title/signature say right
    // (audit: 7/7 rows mis-stamped). Both orchestrator instances now emit an
    // identical, correct row → the last-writer-wins dedup is harmless.
    const computedMetricId: MetricId =
      agg.weakest_direction === 'straight' ? this.metricId : DIR_TO_METRIC_ID[agg.weakest_direction];

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
        metric: computedMetricId,
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
