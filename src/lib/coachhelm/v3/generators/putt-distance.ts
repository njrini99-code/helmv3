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
 *
 * Other distance buckets (15-25, 25+) currently have no v3 standing
 * data (cache bucket misalignment) and so this generator skips them.
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
import { METRIC_RENDER_CONFIG } from '@/lib/coachhelm/v3/standing/metric-config';

type PuttBucketKey = '3_5ft' | '5_10ft' | '10_15ft';

const BUCKET_TO_METRIC_ID: Record<PuttBucketKey, MetricId> = {
  '3_5ft':  'putts_made_3_5ft_pct',
  '5_10ft': 'putts_made_5_10ft_pct',
  '10_15ft':'putts_made_10_15ft_pct',
};

const BUCKET_TO_CACHE_COLUMN: Record<PuttBucketKey, string> = {
  '3_5ft':  'putt_make_pct_3_5ft',
  '5_10ft': 'putt_make_pct_5_10ft',
  '10_15ft':'putt_make_pct_10_15ft',
};

const BUCKET_LABEL: Record<PuttBucketKey, string> = {
  '3_5ft':  '3-5 ft',
  '5_10ft': '5-10 ft',
  '10_15ft':'10-15 ft',
};

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

    const title = `${label} putting: ${valueDisp}`;
    const content =
      `Across your last ${agg.rounds_played} rounds you're making ${valueDisp} ` +
      `of putts from ${label}. The standing card below shows how that ` +
      `compares to your team and the PGA Tour baseline.`;

    const signature = `putt_distance:${agg.bucket}`;

    return {
      title,
      content,
      signature,
      evidence: {
        metric: this.metricId,
        metric_label: cfg?.display_label ?? `Putts Made ${label}`,
        unit: 'percent',
        your_value: agg.playerValue,
        your_value_display: valueDisp,
        comparison_value: 0,
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
