/**
 * v3 PuttDistanceGenerator — first concrete BaseGenerator (W21).
 *
 * Emits a putts-made-by-distance insight for the bucket whose v3
 * metric_id this instance is configured for. One bucket = one
 * generator instance; orchestrator instantiates 3 (per the 3 buckets
 * that align cleanly with cache columns + standing data).
 *
 * Reads from golf_player_stats_cache (the same per-bucket make-%
 * columns W11's RPC reads). For the future generators that need raw
 * shot-level data, a shot-source helper lands alongside them.
 *
 * Master plan Part V.5 → v3 metric_ids covered:
 *   putts_made_3_5ft_pct
 *   putts_made_5_10ft_pct
 *   putts_made_10_15ft_pct
 *   putts_made_15_25ft_pct   (lag — maps to cache putt_make_pct_15_25ft)
 *   putts_made_25_plus_ft_pct (lag — maps to cache putt_make_pct_25_plus_ft)
 *
 * NOTE: the lag metrics now read the EXACT canonical cache bands
 * putt_make_pct_15_25ft / putt_make_pct_25_plus_ft (computed by
 * update_player_putt_make_pct from shot-level putt distances; the standing RPC
 * binds the same columns — migration 20260606180000). The earlier ~5ft-offset
 * 15_20/20_plus approximation is gone. Lag is the domain's #1 3-putt driver.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { fromUntyped } from '@/lib/supabase/untyped';
import { BaseGenerator } from '@/lib/coachhelm/v3/engine/generator-base';
import type {
  ComposedContent,
  GeneratorAggregate,
  InsightCategory,
  InsightPriority,
  MetricId,
} from '@/lib/coachhelm/v3/engine/types';
import { METRIC_RENDER_CONFIG } from '@/lib/coachhelm/v3/standing/metric-config';

type PuttBucketKey = '3_5ft' | '5_10ft' | '10_15ft' | '15_25ft' | '25_plus_ft';

const BUCKET_TO_METRIC_ID: Record<PuttBucketKey, MetricId> = {
  '3_5ft':    'putts_made_3_5ft_pct',
  '5_10ft':   'putts_made_5_10ft_pct',
  '10_15ft':  'putts_made_10_15ft_pct',
  '15_25ft':  'putts_made_15_25ft_pct',
  '25_plus_ft':'putts_made_25_plus_ft_pct',
};

// Buckets map to the true-band cache columns. The standing RPC uses the SAME
// mapping so generator + standing agree, and both align with the
// golf_pga_standards bands (15-25, 25+). The 15_25ft / 25_plus_ft columns are
// populated by update_player_putt_make_pct() (migration 20260606160000); the
// legacy 15_20 / 20_plus columns remain for the v2/fingerprint literal-band UI.
const BUCKET_TO_CACHE_COLUMN: Record<PuttBucketKey, string> = {
  '3_5ft':    'putt_make_pct_3_5ft',
  '5_10ft':   'putt_make_pct_5_10ft',
  '10_15ft':  'putt_make_pct_10_15ft',
  '15_25ft':  'putt_make_pct_15_25ft',
  '25_plus_ft':'putt_make_pct_25_plus_ft',
};

const BUCKET_LABEL: Record<PuttBucketKey, string> = {
  '3_5ft':    '3-5 ft',
  '5_10ft':   '5-10 ft',
  '10_15ft':  '10-15 ft',
  '15_25ft':  '15-25 ft',
  '25_plus_ft':'25+ ft',
};

/**
 * PGA Tour make % by distance (gen-putt-distance-1). Mirrors
 * `golf_pga_standards.pga_tour_value` (2024 season) for these metric_ids — the
 * same value the StandingBar renders from the DB. The old `comparison_value: 0`
 * made the WhyPopover read "95% vs 0% PGA" (an inverted, nonsensical anchor);
 * this is the real Tour reference so the flat comparison line agrees with the
 * standing bar. Source: golf_pga_standards (verified live 2026-06-06).
 */
const PGA_MAKE_PCT_BY_BUCKET: Record<PuttBucketKey, number> = {
  '3_5ft':     90.5,
  '5_10ft':    62.2,
  '10_15ft':   35.7,
  '15_25ft':   15.4,
  '25_plus_ft': 5.5,
};

/** Which putting band each bucket belongs to — drives the synthesized action.
 *  'makeable' = a putt you should hole (3-15 ft); 'lag' = speed/approach-driven. */
const BUCKET_BAND_CLASS: Record<PuttBucketKey, 'makeable' | 'lag'> = {
  '3_5ft': 'makeable',
  '5_10ft': 'makeable',
  '10_15ft': 'makeable',
  '15_25ft': 'lag',
  '25_plus_ft': 'lag',
};

/** A makeable band is "well below" Tour when this many pp short — the
 *  highest-leverage verdict. Below the smaller gap = a watch verdict. */
const MAKEABLE_BIG_GAP_PP = 15;

interface PuttDistanceAggregate extends GeneratorAggregate {
  bucket: PuttBucketKey;
  /** Cache value the generator read. May be 0..1 fraction or 0..100 pct. */
  rawValue: number;
  rounds_played: number;
}

export class PuttDistanceGenerator extends BaseGenerator<PuttDistanceAggregate> {
  readonly name = 'PuttDistanceGenerator';
  readonly insightType = 'putt_distance';
  readonly category: InsightCategory = 'putting';
  readonly minSampleN = 5; // rounds_played floor

  readonly metricId: MetricId;
  readonly bucket: PuttBucketKey;

  constructor(playerId: string, bucket: PuttBucketKey) {
    super(playerId);
    this.bucket = bucket;
    this.metricId = BUCKET_TO_METRIC_ID[bucket];
  }

  async aggregate(): Promise<PuttDistanceAggregate | null> {
    const supabase = createAdminClient();
    const col = BUCKET_TO_CACHE_COLUMN[this.bucket];
    // Dynamic column name + new metric IDs not in generated types yet —
    // go via the untyped escape hatch.
    const { data, error } = await fromUntyped(supabase, 'golf_player_stats_cache')
      .select(`player_id, rounds_played, ${col}`)
      .eq('player_id', this.playerId)
      .maybeSingle() as {
        data: Record<string, number | null> | null;
        error: { message: string } | null;
      };

    if (error || !data) return null;

    const raw = data[col];
    if (raw === null || raw === undefined) return null;

    const playerValue = Number(raw);
    const normalized = playerValue <= 1 ? playerValue * 100 : playerValue;
    const roundsPlayed = (data.rounds_played as number | null) ?? 0;

    return {
      sampleN: roundsPlayed,
      playerValue: normalized,
      bucket: this.bucket,
      rawValue: playerValue,
      rounds_played: roundsPlayed,
    };
  }

  composeContent(agg: PuttDistanceAggregate): ComposedContent {
    const cfg = METRIC_RENDER_CONFIG[this.metricId];
    const valueDisp = `${Math.round(agg.playerValue)}%`;
    const label = BUCKET_LABEL[agg.bucket];
    // Real PGA Tour make % for this bucket (gen-putt-distance-1) — replaces the
    // hard-coded 0 that produced the inverted "X% vs 0% PGA" WhyPopover anchor.
    const pgaValue = PGA_MAKE_PCT_BY_BUCKET[agg.bucket];

    const signature = `putt_distance:${agg.bucket}`;
    const bandClass = BUCKET_BAND_CLASS[agg.bucket];
    const gapPp = pgaValue - agg.playerValue; // positive = below Tour
    const base =
      `Across your last ${agg.rounds_played} rounds you're making ${valueDisp} ` +
      `of putts from ${label} (PGA Tour ~${pgaValue.toFixed(0)}%).`;

    let verdict: string;
    let composedPriority: InsightPriority;
    if (gapPp <= 0) {
      verdict = ` You're at or above the Tour rate here — a strength, leave it alone.`;
      composedPriority = 'low';
    } else if (bandClass === 'makeable') {
      // Makeable distance below Tour = the highest-leverage, fastest-to-fix leak.
      const lead = gapPp >= MAKEABLE_BIG_GAP_PP
        ? `This is your highest-leverage putting band:`
        : `Worth tightening:`;
      verdict =
        ` ${lead} ${label} is makeable distance and you're ${Math.round(gapPp)} points below Tour. ` +
        `The fix is a gate drill (two tees a ball-width apart) plus a daily short-putt ladder — ` +
        `pure-strike reps, not green-reading.`;
      composedPriority = gapPp >= MAKEABLE_BIG_GAP_PP ? 'medium' : 'low';
    } else {
      // Lag band: a low make% here is speed + how far the approach/chip left you,
      // not stroke mechanics (matches the shot-drivers lag attribution).
      verdict =
        ` From ${label} make% is mostly lag: the driver is speed control and how far your ` +
        `approach/chip leaves you, not your stroke. Work distance-control lags to a 3-ft ` +
        `circle and tighter approach proximity — don't drill the stroke.`;
      composedPriority = 'low';
    }

    const title = `${label} putting: ${valueDisp}`;
    const content = base + verdict;

    return {
      title,
      content,
      // Composed from the band's anchor-relative gap; Phase A's
      // leveragePriorityFloor can still upgrade from the counterfactual leverage.
      priority: composedPriority,
      signature,
      evidence: {
        metric: this.metricId,
        metric_label: cfg?.display_label ?? `Putts Made ${label}`,
        unit: 'percent',
        your_value: agg.playerValue,
        your_value_display: valueDisp,
        // Real PGA Tour make % (gen-putt-distance-1) — was hard-coded 0.
        comparison_value: pgaValue,
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
