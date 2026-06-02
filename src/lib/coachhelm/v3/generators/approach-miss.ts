/**
 * v3 ApproachMissGenerator (P1b — reach-vs-dial-in redesign).
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
 * WHAT THIS INSIGHT ANSWERS (the coach's real question — is it reach or dial-in?):
 *   1. GREEN-HIT % (primary): of the approaches from this band, how many found the
 *      green. A low rate is a REACH problem (club/contact/commitment).
 *   2. PROXIMITY WHEN THE GREEN IS HIT (feet, secondary): how close the ball finishes
 *      WHEN it reaches the green. Poor here with a healthy green-hit% is a DIAL-IN
 *      problem (distance control), not a reach problem.
 *
 * UNIT INTEGRITY (the bug this fixes): proximity is a green-surface distance (feet).
 * A MISSED approach finishes off-green (stored in YARDS); the old generator ran that
 * yards value through ×3 and averaged it as "feet", inflating proximity ~2× (the
 * "175+ → 63 ft" artifact). Proximity is now computed ONLY over green-finding shots,
 * whose finish is genuinely on the green (feet). Missed approaches are counted by the
 * green-hit rate, never as a fabricated proximity.
 *
 * V1 ships with requiresStanding=false (diagnostic). Standing-row population for these
 * metrics is a follow-up RPC; the PGA green-hit anchors below are APPROXIMATE.
 */

import { BaseGenerator } from '@/lib/coachhelm/v3/engine/generator-base';
import {
  loadApproachShots,
  bucketApproachDistance,
  type ApproachBucket,
  type ApproachShot,
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

/** Proximity-WHEN-ON-GREEN Tour anchors (feet), Research doc §2. Used for the dial-in
 *  comparison — only meaningful for shots that actually found the green. */
const TOUR_PROXIMITY_FEET: Record<ApproachBucket, number> = {
  '50_125ft':    18,
  '125_175ft':   30,
  '175_plus_ft': 45,
};

/** APPROXIMATE PGA green-hit % by approach band (no sourced per-band table yet — see
 *  Research doc §2 ranges 75-85 / 60-70 / 45-55%). Flagged "approx" in the prose. */
const TOUR_GREEN_HIT_PCT: Record<ApproachBucket, number> = {
  '50_125ft':    80,
  '125_175ft':   65,
  '175_plus_ft': 50,
};

/** Need at least this many GREENS HIT in the band before reporting a proximity —
 *  an average over one or two greens is noise. */
const MIN_GREENS_FOR_PROXIMITY = 3;

/** Did the approach find the green? Result is the canonical signal; lie_after is a
 *  corroborating fallback for older rows where only the lie was recorded. */
function reachedGreen(s: ApproachShot): boolean {
  const r = (s.result ?? '').toLowerCase();
  if (r === 'green' || r === 'hole' || r === 'gir') return true;
  return (s.lie_after ?? '').toLowerCase() === 'green';
}

/** On-green finish → feet. On-green rows are stored in feet; the ×3 only guards the
 *  rare legacy on-green-in-yards row (off-green misses are excluded upstream, so this
 *  never ×3's a real yards "miss" into the proximity). */
function onGreenFinishFeet(s: ApproachShot): number {
  return s.distance_unit_after === 'feet'
    ? Number(s.distance_to_hole_after)
    : Number(s.distance_to_hole_after) * 3;
}

interface ApproachMissAggregate extends GeneratorAggregate {
  bucket: ApproachBucket;
  attempts: number;
  green_hit_n: number;
  green_hit_pct: number;
  /** Avg proximity in FEET over green-finding shots only; null when too few greens hit. */
  proximity_when_hit_feet: number | null;
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

    const greenShots = inBucket.filter(reachedGreen);
    const greenHitN = greenShots.length;
    const greenHitPct = (100 * greenHitN) / inBucket.length;

    // Proximity is ON-GREEN ONLY (feet), averaged over green-finding shots — never the
    // off-green (yards) misses, which used to be ×3'd into a fake proximity.
    const proximityWhenHit =
      greenHitN >= MIN_GREENS_FOR_PROXIMITY
        ? greenShots.reduce((a, s) => a + onGreenFinishFeet(s), 0) / greenHitN
        : null;

    const penaltyCount = inBucket.filter((s) => s.is_penalty).length;

    return {
      sampleN: inBucket.length,
      // Green-hit % is the headline signal for this insight (reach). Unused downstream
      // for diagnostic generators (requiresStanding=false), but semantically the lead.
      playerValue: greenHitPct,
      bucket: this.bucket,
      attempts: inBucket.length,
      green_hit_n: greenHitN,
      green_hit_pct: greenHitPct,
      proximity_when_hit_feet: proximityWhenHit,
      penalty_rate_pct: inBucket.length > 0 ? (100 * penaltyCount) / inBucket.length : 0,
    };
  }

  composeContent(agg: ApproachMissAggregate): ComposedContent {
    const label = BUCKET_LABEL[agg.bucket];
    const tourGreenHit = TOUR_GREEN_HIT_PCT[agg.bucket];
    const tourProx = TOUR_PROXIMITY_FEET[agg.bucket];
    const ghDisp = `${agg.green_hit_pct.toFixed(0)}%`;
    const prox = agg.proximity_when_hit_feet;

    // Title leads with reach (green-hit %); proximity-when-hit rides along when reliable.
    const title =
      prox != null
        ? `${label} approach: ${ghDisp} greens hit · ${prox.toFixed(0)} ft when you do`
        : `${label} approach: ${ghDisp} greens hit`;

    // Reach sentence + (when enough greens) the dial-in sentence — this is what tells the
    // coach whether the leak is finding greens or controlling distance once there.
    const reachSentence =
      `Across your last ${agg.attempts} approaches from ${label} you found the green ` +
      `${ghDisp} of the time (PGA Tour ~${tourGreenHit}%, approximate).`;
    const dialInSentence =
      prox != null
        ? ` When you do reach it you finish ${prox.toFixed(0)} ft from the hole ` +
          `(Tour ~${tourProx} ft) — that's the dial-in once you're on.`
        : ` Too few greens hit from here to read a reliable proximity yet — the gap is ` +
          `finding the green, not distance control on it.`;
    const penaltySentence =
      agg.penalty_rate_pct > 5
        ? ` Note: ${agg.penalty_rate_pct.toFixed(0)}% of these approaches incurred a penalty — worth flagging in practice.`
        : '';

    return {
      title,
      content: reachSentence + dialInSentence + penaltySentence,
      // Descriptive diagnostic — severity is read off the StandingBar, not the verdict.
      priority: 'low',
      signature: `approach_miss:${agg.bucket}`,
      evidence: {
        metric: this.metricId,
        metric_label: `Greens hit from ${label}`,
        unit: 'percent',
        your_value: agg.green_hit_pct,
        your_value_display: ghDisp,
        comparison_value: tourGreenHit,
        comparison_label: 'PGA Tour (approx)',
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
