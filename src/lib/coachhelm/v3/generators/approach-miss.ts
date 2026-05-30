/**
 * v3 ApproachMissGenerator (wave-3bucket-fix).
 *
 * Previously deferred from W22 because the cache only has overall
 * approach_proximity_average, not per-bucket. Now built using the
 * shot-source helper which aggregates from raw golf_shots.
 *
 * 3-BUCKET CLUB MODEL (master plan Part V.1.5):
 *   Bucketed by APPROACH DISTANCE (50-125 / 125-175 / 175+ yards),
 *   NOT by club. The shot-tracking module captures `non_driver` as
 *   the only "iron" category — per-iron granularity does not exist.
 *
 * One instance per bucket. v3 metric IDs:
 *   approach_proximity_50_125ft
 *   approach_proximity_125_175ft
 *   approach_proximity_175_plus_ft
 *
 * V1 ships with requiresStanding=false (diagnostic). Standing-row
 * population for these metrics is a follow-up RPC; once it exists,
 * remove the override and the generator picks up team + Tour
 * comparison automatically.
 */

import { BaseGenerator } from '@/lib/coachhelm/v3/engine/generator-base';
import {
  loadApproachShots,
  bucketApproachDistance,
  type ApproachBucket,
} from '@/lib/coachhelm/v3/engine/shot-source';
import type {
  ComposedContent,
  GeneratorAggregate,
  InsightCategory,
  MetricId,
} from '@/lib/coachhelm/v3/engine/types';

const BUCKET_TO_METRIC_ID: Record<ApproachBucket, MetricId> = {
  '50_125ft':      'approach_proximity_50_125ft',
  '125_175ft':     'approach_proximity_125_175ft',
  '175_plus_ft':   'approach_proximity_175_plus_ft',
};

const BUCKET_LABEL: Record<ApproachBucket, string> = {
  '50_125ft':    '50-125 yd',
  '125_175ft':   '125-175 yd',
  '175_plus_ft': '175+ yd',
};

/** Tour proximity anchors from Research doc §2 — used inline for content. */
const TOUR_PROXIMITY_FEET: Record<ApproachBucket, number> = {
  '50_125ft':    18,
  '125_175ft':   30,
  '175_plus_ft': 45,
};

interface ApproachMissAggregate extends GeneratorAggregate {
  bucket: ApproachBucket;
  attempts: number;
  avg_proximity_feet: number;
  penalty_rate_pct: number;
}

export class ApproachMissGenerator extends BaseGenerator<ApproachMissAggregate> {
  readonly name = 'ApproachMissGenerator';
  readonly insightType = 'approach_miss';
  readonly category: InsightCategory = 'approach';
  readonly minSampleN = 5; // attempts in the bucket
  protected override readonly requiresStanding = false;

  readonly metricId: MetricId;
  readonly bucket: ApproachBucket;

  constructor(playerId: string, bucket: ApproachBucket) {
    super(playerId);
    this.bucket = bucket;
    this.metricId = BUCKET_TO_METRIC_ID[bucket];
  }

  async aggregate(): Promise<ApproachMissAggregate | null> {
    const shots = await loadApproachShots(this.playerId);
    const inBucket = shots.filter(
      (s) => bucketApproachDistance(s.distance_to_hole_before) === this.bucket,
    );
    if (inBucket.length === 0) return null;

    // distance_to_hole_after is stored in the same unit table the cache
    // uses for proximity displays — treat as feet for the 50-125 yd
    // bucket (Tour anchor is in feet). For longer buckets we accept the
    // raw value; the comparison line below uses the same unit assumption.
    const proximity_sum = inBucket.reduce((a, s) => a + Number(s.distance_to_hole_after), 0);
    const avg = proximity_sum / inBucket.length;
    const penaltyCount = inBucket.filter((s) => s.is_penalty).length;

    return {
      sampleN: inBucket.length,
      playerValue: avg,
      bucket: this.bucket,
      attempts: inBucket.length,
      avg_proximity_feet: avg,
      penalty_rate_pct: inBucket.length > 0 ? (100 * penaltyCount) / inBucket.length : 0,
    };
  }

  composeContent(agg: ApproachMissAggregate): ComposedContent {
    const tour = TOUR_PROXIMITY_FEET[agg.bucket];
    const diff = agg.avg_proximity_feet - tour;
    const diffDisp = diff > 0 ? `+${diff.toFixed(0)}` : diff.toFixed(0);
    const label = BUCKET_LABEL[agg.bucket];
    const valueDisp = `${agg.avg_proximity_feet.toFixed(0)} ft`;

    const title = `${label} approach: ${valueDisp} avg proximity (${diffDisp} vs PGA)`;
    const content =
      `Across your last ${agg.attempts} approach shots from ${label} you ` +
      `averaged ${valueDisp} from the hole. PGA Tour averages ~${tour} ft ` +
      `from this distance (Research doc §2). ` +
      (agg.penalty_rate_pct > 5
        ? `Note: ${agg.penalty_rate_pct.toFixed(0)}% of these approaches incurred a penalty — worth flagging in practice.`
        : '');

    return {
      title,
      content,
      // Descriptive proximity standing row — severity is read off the StandingBar, not the verdict.
      priority: 'low',
      signature: `approach_miss:${agg.bucket}`,
      evidence: {
        metric: this.metricId,
        metric_label: `Approach Proximity ${label}`,
        unit: 'feet',
        your_value: agg.avg_proximity_feet,
        your_value_display: valueDisp,
        comparison_value: tour,
        comparison_label: 'PGA Tour avg',
        comparison_source: 'pga_baseline',
        sample_n: agg.attempts,
        window_days: 90,
        window_start: '',
        window_end: '',
        strokes_impact: 0,
        strokes_impact_method: 'peer_delta',
        confidence: 0,
        confidence_factors: {
          sample_adequacy: Math.min(agg.attempts / 25, 1),
          recency: 1.0,
          variance: 0.5,
        },
      },
    };
  }
}
