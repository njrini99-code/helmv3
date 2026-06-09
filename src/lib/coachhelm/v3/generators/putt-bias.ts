/**
 * v3 PuttBiasGenerator (W22; F2+F3 distance-controlled L-vs-R 2026-06-08).
 *
 * Diagnostic — emits ONE insight about the player's dominant break-direction
 * putting weakness. No PGA standing exists for putt-bias metrics (per-player
 * tendency, not a tour benchmark), so requiresStanding=false (ships without the
 * StandingBar).
 *
 * F2+F3: the original straight-vs-break comparison was a DISTANCE ARTIFACT.
 * Straight putts average 1.5 ft (~97% make) while breakers average ~13 ft
 * (~21% make), so the gap reflected putt length, not green-reading ability.
 * The new approach:
 *   1. Bucket putts by (distance band × slope) — left_to_right vs right_to_left.
 *   2. Compare make-% within each cut (distance held constant → gaps = green-reading).
 *   3. Gate the claim with a two-proportion z-test + effect-size floor.
 *   4. Only emit a directional bias if the winning cut is statistically significant.
 *
 * `golf_shots.putt_break` values used: 'left_to_right' | 'right_to_left'.
 * 'straight' and 'multiple' are excluded — straight is the distance-artifact
 * baseline we no longer compare against; 'multiple' is not a single tendency.
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
import {
  twoProportionZTest,
  bandFor,
  type DistanceBand,
} from '@/lib/coachhelm/v3/stats/proportion-test';

/** Window for the shot-level putt-break read (days), completed rounds only. */
const WINDOW_DAYS = 90;

const DIR_TO_METRIC_ID: Record<'left' | 'right', MetricId> = {
  left: 'putt_miss_bias_left_pct',
  right: 'putt_miss_bias_right_pct',
};

export interface PuttBiasAggregate extends GeneratorAggregate {
  /** Whether a band+slope-controlled directional gap passed the z-test gate. */
  significant: boolean;
  /** The break direction the player is worse on within the winning cut, or null. */
  weakest_direction: 'left' | 'right' | null;
  /** Distance band of the winning cut (e.g. '11-20 ft'), or null. */
  band: string | null;
  /** Putt slope of the winning cut ('level'|'uphill'|'downhill'|'severe'), or null. */
  slope: string | null;
  /** Make-% on the weaker direction within the cut. */
  weak_pct: number | null;
  /** Make-% on the stronger direction within the cut. */
  strong_pct: number | null;
  /** strong_pct - weak_pct, percentage points. */
  gap_pp: number;
  weak_n: number;
  strong_n: number;
  rounds_played: number;
}

/** One scored putt with a recorded break, slope and distance (feet). */
export interface PuttRow {
  putt_break: string;
  putt_slope: string | null;
  dist_ft: number;
  made: boolean;
}

interface WeakestCut {
  weakest_direction: 'left' | 'right';
  band: DistanceBand['label'];
  slope: string | null;
  weak_pct: number;
  strong_pct: number;
  gap_pp: number;
  weak_n: number;
  strong_n: number;
}

/**
 * Pure cut-selection: across every (distance band × slope) cut, compare
 * left-to-right vs right-to-left make-%. Return the cut with the largest gap
 * that passes the effect-size + z-test gate, or null. Distance is held
 * constant within a band, so the gap reflects green-reading, not putt length.
 */
export function selectWeakestCut(rows: PuttRow[]): WeakestCut | null {
  type Tally = { ltrMade: number; ltrN: number; rtlMade: number; rtlN: number };
  const cuts = new Map<string, Tally & { band: DistanceBand['label']; slope: string | null }>();

  for (const r of rows) {
    const band = bandFor(r.dist_ft);
    if (!band) continue;
    if (r.putt_break !== 'left_to_right' && r.putt_break !== 'right_to_left') continue;
    const slope = r.putt_slope ?? null;
    const key = `${band}|${slope ?? 'unknown'}`;
    let t = cuts.get(key);
    if (!t) {
      t = { ltrMade: 0, ltrN: 0, rtlMade: 0, rtlN: 0, band, slope };
      cuts.set(key, t);
    }
    if (r.putt_break === 'left_to_right') {
      t.ltrN += 1;
      if (r.made) t.ltrMade += 1;
    } else {
      t.rtlN += 1;
      if (r.made) t.rtlMade += 1;
    }
  }

  let best: WeakestCut | null = null;
  for (const t of cuts.values()) {
    const test = twoProportionZTest(t.ltrMade, t.ltrN, t.rtlMade, t.rtlN);
    if (!test.significant) continue;
    const ltrPct = (t.ltrMade / t.ltrN) * 100;
    const rtlPct = (t.rtlMade / t.rtlN) * 100;
    const ltrWeaker = test.gapPp < 0; // gapPp = ltrPct - rtlPct; <0 → LtR weaker
    const cut: WeakestCut = {
      weakest_direction: ltrWeaker ? 'left' : 'right',
      band: t.band,
      slope: t.slope,
      weak_pct: ltrWeaker ? ltrPct : rtlPct,
      strong_pct: ltrWeaker ? rtlPct : ltrPct,
      gap_pp: Math.abs(test.gapPp),
      weak_n: ltrWeaker ? t.ltrN : t.rtlN,
      strong_n: ltrWeaker ? t.rtlN : t.ltrN,
    };
    if (!best || cut.gap_pp > best.gap_pp) best = cut;
  }
  return best;
}

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

  /** Both directional instances aggregate the SAME data and emit the same signature ('putt_bias:balanced' or the data-derived weakest direction), so they share the whole putt_bias scope; the post-emit keep makes the sweep idempotent across the pair, and a heal to 'balanced' retracts the stale directional row. */
  protected override signatureScope(): string {
    return 'putt_bias:';
  }

  async aggregate(): Promise<PuttBiasAggregate | null> {
    const supabase = createAdminClient();
    const since = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString().slice(0, 10);

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

    const { data: putts, error: pErr } = await fromUntyped(supabase, 'golf_shots')
      .select('putt_break, putt_made, putt_slope, distance_to_hole_before, distance_unit_before')
      .eq('shot_type', 'putting')
      .in('round_id', roundIds) as {
        data: Array<{
          putt_break: string | null;
          putt_made: boolean | null;
          putt_slope: string | null;
          distance_to_hole_before: number | null;
          distance_unit_before: string | null;
        }> | null;
        error: { message: string } | null;
      };
    if (pErr || !putts) return null;

    const rows: PuttRow[] = [];
    for (const p of putts) {
      if (p.putt_made === null || p.putt_made === undefined) continue;
      if (p.putt_break !== 'left_to_right' && p.putt_break !== 'right_to_left') continue;
      const raw = p.distance_to_hole_before;
      if (raw === null || raw === undefined) continue;
      const distFt = p.distance_unit_before === 'yards' ? raw * 3 : raw; // feet default
      rows.push({
        putt_break: p.putt_break,
        putt_slope: p.putt_slope,
        dist_ft: distFt,
        made: p.putt_made === true,
      });
    }

    const cut = selectWeakestCut(rows);

    // sampleN gates on ROUNDS so the base-class minSampleN(=5) still applies.
    const base: PuttBiasAggregate = {
      sampleN: roundIds.length,
      playerValue: cut ? cut.weak_pct : 0,
      rounds_played: roundIds.length,
      significant: cut !== null,
      weakest_direction: cut?.weakest_direction ?? null,
      band: cut?.band ?? null,
      slope: cut?.slope ?? null,
      weak_pct: cut?.weak_pct ?? null,
      strong_pct: cut?.strong_pct ?? null,
      gap_pp: cut?.gap_pp ?? 0,
      weak_n: cut?.weak_n ?? 0,
      strong_n: cut?.strong_n ?? 0,
    };
    return base;
  }

  composeContent(agg: PuttBiasAggregate): ComposedContent {
    if (
      !agg.significant ||
      agg.weakest_direction === null ||
      agg.band === null ||
      agg.weak_pct === null ||
      agg.strong_pct === null
    ) {
      return {
        title: 'Putting break check: no directional bias detected',
        content: `Across your last ${agg.rounds_played} rounds, your make rate on left-break vs right-break putts is statistically even once distance is controlled for — no single break direction stands out. Keep working both ways on the practice green.`,
        priority: 'low',
        signature: 'putt_bias:balanced',
        evidence: {
          metric: 'putt_miss_bias_left_pct',
          metric_label: 'Break-direction make % (distance-controlled)',
          unit: 'percent',
          your_value: 0,
          your_value_display: '—',
          comparison_value: 0,
          comparison_label: 'Even across break directions',
          comparison_source: 'your_baseline',
          sample_n: agg.rounds_played,
          window_days: WINDOW_DAYS,
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

    const breakLabel = agg.weakest_direction === 'left' ? 'left-to-right' : 'right-to-left';
    const computedMetricId: MetricId =
      agg.weakest_direction === 'left' ? 'putt_miss_bias_left_pct' : 'putt_miss_bias_right_pct';

    const weakDisp = `${Math.round(agg.weak_pct)}%`;
    const strongDisp = `${Math.round(agg.strong_pct)}%`;
    const gap = Math.round(agg.gap_pp);
    const slopeText = agg.slope ? `, ${agg.slope}` : '';
    const action =
      agg.weakest_direction === 'left'
        ? `start your read higher on the left edge and commit to playing more break — your makes drop on left-to-right putts, the classic under-read.`
        : `start your read higher on the right edge and commit to playing more break — your makes drop on right-to-left putts, the classic under-read.`;
    const slopeAction = agg.slope
      ? ` It shows up most on ${agg.slope} ${agg.band} putts, so rehearse that exact look.`
      : '';

    return {
      title: `Putting break: under-reading ${breakLabel} (${agg.band})`,
      content: `On ${agg.band}${slopeText} putts you're making ${weakDisp} of ${breakLabel} breaks vs ${strongDisp} the other way — a ${gap}-point gap at matched distance (n=${agg.weak_n}/${agg.strong_n}). ${action}${slopeAction}`,
      priority: 'medium',
      signature: `putt_bias:${agg.weakest_direction}:${agg.band}`,
      evidence: {
        metric: computedMetricId,
        metric_label: 'Break-direction make % (distance-controlled)',
        unit: 'percent',
        your_value: agg.weak_pct,
        your_value_display: weakDisp,
        comparison_value: agg.strong_pct,
        comparison_label: `Your ${agg.weakest_direction === 'left' ? 'right-to-left' : 'left-to-right'} make % (same band)`,
        comparison_source: 'your_baseline',
        sample_n: agg.weak_n + agg.strong_n,
        window_days: WINDOW_DAYS,
        window_start: '',
        window_end: '',
        strokes_impact: 0,
        strokes_impact_method: 'peer_delta',
        confidence: Math.min(1, (agg.weak_n + agg.strong_n) / 60),
        confidence_factors: {
          sample_adequacy: Math.min((agg.weak_n + agg.strong_n) / 60, 1),
          recency: 1.0,
          variance: 0.5,
        },
      },
    };
  }
}
