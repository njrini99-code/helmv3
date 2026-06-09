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
import { round } from '@/lib/golf/stat-formulas';
import { cohortAnchor, type CohortGender } from '@/lib/coachhelm/v3/counterfactual/cohort-baselines';
import { loadPlayerCohort } from '@/lib/coachhelm/v3/counterfactual/player-cohort-loader';
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
import {
  dominantAxis,
  approachAxisDriver,
  type AxisTally,
} from '@/lib/coachhelm/v3/engine/diagnosis';

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

/** On-green finish → feet. On-green rows are stored in feet; the ×3 only converts the
 *  rare legacy on-green-in-yards row (off-green misses are excluded upstream, so this
 *  never ×3's a real yards "miss" into the proximity). A null/unknown unit is treated
 *  as ALREADY feet (the on-green default) — only an explicit 'yards' row is scaled, so
 *  a unit-less 20 ft proximity is no longer inflated to 60 ft. */
function onGreenFinishFeet(s: ApproachShot): number {
  return s.distance_unit_after === 'yards'
    ? Number(s.distance_to_hole_after) * 3
    : Number(s.distance_to_hole_after);
}

/** Classify a raw miss_direction into its short/long and left/right poles. A
 *  direction may contribute to BOTH axes (e.g. 'short_right' → short + right);
 *  a pure 'short' contributes short + L/R-neutral. Unknown → neutral on both. */
function classifyMiss(raw: string | null): { sl: keyof AxisTally; lr: keyof AxisTally } {
  const v = (raw ?? '').toLowerCase();
  const sl: keyof AxisTally = v.includes('short') ? 'negative' : v.includes('long') ? 'positive' : 'neutral';
  const lr: keyof AxisTally = v.includes('left') ? 'negative' : v.includes('right') ? 'positive' : 'neutral';
  return { sl, lr };
}

interface ApproachMissAggregate extends GeneratorAggregate {
  bucket: ApproachBucket;
  attempts: number;
  green_hit_n: number;
  green_hit_pct: number;
  /** Avg proximity in FEET over green-finding shots only; null when too few greens hit. */
  proximity_when_hit_feet: number | null;
  penalty_rate_pct: number;
  /** Short(neg)/long(pos) tally over off-green misses in this bucket. */
  miss_short_long: AxisTally;
  /** Left(neg)/right(pos) tally over off-green misses in this bucket. */
  miss_left_right: AxisTally;
  /** Team gender used to select the per-gender comparison anchor. */
  cohort_gender: CohortGender;
  /** Attempts in this bucket per distinct round — used for CF attempt-rate sizing. */
  attempts_per_round: number;
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

  protected override signatureScope(): string {
    return `approach_miss:${this.bucket}`;
  }

  async aggregate(): Promise<ApproachMissAggregate | null> {
    const shots = await loadApproachShots(this.playerId);
    const inBucket = shots.filter(
      (s) => bucketApproachDistance(s.distance_to_hole_before) === this.bucket,
    );
    if (inBucket.length === 0) return null;

    const cohort = await loadPlayerCohort(this.playerId);
    const distinctRounds = new Set(inBucket.map((s) => s.round_id)).size;

    const greenShots = inBucket.filter(reachedGreen);
    const greenHitN = greenShots.length;
    // 1 dp to match the canonical pct() display contract (inBucket.length > 0
    // guaranteed by the early return above).
    const greenHitPct = round((100 * greenHitN) / inBucket.length, 1);

    // Proximity is ON-GREEN ONLY (feet), averaged over green-finding shots — never the
    // off-green (yards) misses, which used to be ×3'd into a fake proximity.
    const proximityWhenHit =
      greenHitN >= MIN_GREENS_FOR_PROXIMITY
        ? greenShots.reduce((a, s) => a + onGreenFinishFeet(s), 0) / greenHitN
        : null;

    const penaltyCount = inBucket.filter((s) => s.is_penalty).length;

    const sl: AxisTally = { negative: 0, positive: 0, neutral: 0 };
    const lr: AxisTally = { negative: 0, positive: 0, neutral: 0 };
    for (const s of inBucket) {
      if (reachedGreen(s)) continue; // only misses carry a meaningful miss_direction
      const c = classifyMiss(s.miss_direction);
      sl[c.sl] += 1;
      lr[c.lr] += 1;
    }

    return {
      sampleN: inBucket.length,
      // am-3 (armed-landmine guard): `playerValue` is contractually "the unit of
      // the v3 metric" — and `approach_proximity_*ft` is registered as FEET
      // (lower_better) in the metric registry + counterfactual lookup. The
      // counterfactual reads `agg.playerValue` directly. So playerValue MUST be
      // the on-green proximity in FEET, NEVER the green-hit PERCENT. If it carried
      // the percent (e.g. 70), the day `requiresStanding` flips to true the base
      // would feed "70 feet" into computeCounterfactual vs an ~18 ft Tour target
      // → a fabricated multi-stroke gap. The green-hit % (the display headline)
      // lives in `green_hit_pct` / evidence.your_value, not here.
      // Null proximity (too few greens) → NaN, which the base's Number.isFinite
      // guards on backfill + the priority floor safely ignore (no counterfactual).
      playerValue: proximityWhenHit ?? NaN,
      bucket: this.bucket,
      attempts: inBucket.length,
      green_hit_n: greenHitN,
      green_hit_pct: greenHitPct,
      proximity_when_hit_feet: proximityWhenHit,
      // inBucket.length > 0 is guaranteed by the early return; 1 dp per canonical pct().
      penalty_rate_pct: round((100 * penaltyCount) / inBucket.length, 1),
      miss_short_long: sl,
      miss_left_right: lr,
      cohort_gender: cohort.gender,
      attempts_per_round: inBucket.length / Math.max(1, distinctRounds),
    };
  }

  composeContent(agg: ApproachMissAggregate): ComposedContent {
    const label = BUCKET_LABEL[agg.bucket];
    const tourGreenHit =
      cohortAnchor(this.metricId, agg.cohort_gender) ?? TOUR_GREEN_HIT_PCT[agg.bucket];
    const tourLabel = agg.cohort_gender === 'womens' ? "women's college" : 'PGA Tour';
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
      `${ghDisp} of the time (${tourLabel} ~${tourGreenHit}%, approximate).`;
    const dialInSentence =
      prox != null
        ? ` When you do reach it you finish ${prox.toFixed(0)} ft from the hole ` +
          `(Tour ~${tourProx} ft, over ${agg.green_hit_n} greens) — that's the dial-in once you're on.`
        : ` Too few greens hit from here (${agg.green_hit_n}) to read a reliable proximity yet — the gap is ` +
          `finding the green, not distance control on it.`;
    const penaltySentence =
      agg.penalty_rate_pct > 5
        ? ` Note: ${agg.penalty_rate_pct.toFixed(0)}% of these approaches incurred a penalty — worth flagging in practice.`
        : '';

    // Dominant miss axis → driver+action. Short/long leads (the dial-in lever);
    // left/right is the fallback when the vertical miss is balanced. Omitted
    // entirely when neither axis dominates — no fabricated tendency.
    const slDom = dominantAxis(agg.miss_short_long);
    const lrDom = dominantAxis(agg.miss_left_right);
    let axisSentence = '';
    if (slDom) {
      axisSentence = ' ' + approachAxisDriver(
        slDom.axis === 'negative' ? 'short' : 'long', slDom.share, slDom.n);
    } else if (lrDom) {
      axisSentence = ' ' + approachAxisDriver(
        lrDom.axis === 'negative' ? 'left' : 'right', lrDom.share, lrDom.n);
    }

    return {
      title,
      content: reachSentence + dialInSentence + penaltySentence + axisSentence,
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
        comparison_label: agg.cohort_gender === 'womens' ? "Women's college (approx)" : 'PGA Tour (approx)',
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
        // Structured dial-in signal (feet, on-green only) for downstream
        // composites. `your_value` above is the green-hit PERCENT (reach); the
        // proximity-when-hit lives ONLY here so a rule never mistakes the
        // percent for feet. Null when too few greens hit to read a proximity.
        detail: {
          proximity_when_hit_feet: agg.proximity_when_hit_feet,
          green_hit_pct: agg.green_hit_pct,
        },
      },
    };
  }
}
