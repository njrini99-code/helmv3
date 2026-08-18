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

import { staleDataSuffix } from '@/lib/coachhelm/v3/engine/window-honesty';
import { loadLastRoundDate } from '@/lib/coachhelm/v3/engine/hole-diagnosis';
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

/*
 * REMOVED 2026-08-16: `TOUR_PROXIMITY_FEET` = { 50_125ft: 18, 125_175ft: 30,
 * 175_plus_ft: 45 }, described here as "Proximity-WHEN-ON-GREEN Tour anchors".
 *
 * That description was wrong and the numbers are not comparable to ours. The
 * research doc §2 figures ("100-125 yds: ~20 ft", "200+ yds: ~45+ ft") are PGA
 * Tour *Proximity to Hole* — measured over ALL approaches from the range,
 * misses included; the same section quotes a 75.4% GIR alongside them, which is
 * only coherent if misses are in the average. Our `proximity_when_hit_feet` is
 * averaged over GREEN-FINDING SHOTS ONLY, so conditioning strips out every long
 * miss and the two quantities differ by construction.
 *
 * Printing them side by side told coaches their players out-dial the Tour from
 * 175+ yd (production mean 26 ft vs "Tour 45 ft"). It also made
 * `long_approach_3putt_cascade` unfireable: its gate was Tour-45-plus-5, and
 * ZERO of 29 production insights exceeded 50 ft (observed max 36.3).
 *
 * Do not reintroduce these as a dial-in benchmark. They become usable only if
 * an UNCONDITIONAL proximity is computed — which needs the off-green misses,
 * recorded in YARDS and previously ×3'd into a fake proximity (see aggregate()).
 */

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

/* ───────────────────────────────────────────────────────────────────────────
 * Par split — the 175+ band pools two different shots
 * ────────────────────────────────────────────────────────────────────────── */

export interface ParSplitSide {
  attempts: number;
  /** Green-hit % over this side's attempts; null when there are none. */
  greenHitPct: number | null;
}

export interface ParSplit {
  par4: ParSplitSide;
  par5: ParSplitSide;
  /** Attempts whose hole par is missing or is a par 3 — never folded into either side. */
  unknown: number;
}

/**
 * Split a bucket's attempts by the par of the hole they were played on.
 *
 * Measured 2026-08-18 over every 175+ yd approach from fairway or rough:
 * par 4 → 341 shots at 27.9% greens; par 5 → 1,094 shots at 15.8%. Par 5s are
 * 76% of the band and convert twelve points worse, because at 241 yards the
 * play is often a deliberate lay-up to a wedge number — and a lay-up finishing
 * in the fairway records here as an approach that missed the green.
 *
 * Par 3 counts as UNKNOWN, not as a side: an "approach" from 175+ on a par 3
 * is the tee shot, a different shot again.
 */
export function parSplit(shots: ApproachShot[]): ParSplit {
  const tally = (par: number) => {
    const side = shots.filter((s) => s.par === par);
    if (side.length === 0) return { attempts: 0, greenHitPct: null };
    const greens = side.filter(reachedGreen).length;
    return { attempts: side.length, greenHitPct: round((100 * greens) / side.length, 1) };
  };
  const par4 = tally(4);
  const par5 = tally(5);
  return { par4, par5, unknown: shots.length - par4.attempts - par5.attempts };
}

/** One side must hold this much of the band before the mix is worth reporting. */
const PAR_MIX_DOMINANT_SHARE = 0.6;
/** And the minority side needs at least this many attempts to state a rate. */
const PAR_MIX_MIN_MINORITY = 5;

/**
 * A sentence naming the split, or null when there is nothing to say.
 *
 * Deliberately does NOT infer intent. A par-5 second shot from 175 can be a
 * genuine go-for-it and nothing in the data says which it was, so this reports
 * the composition and the par-4 rate — the one taken while actually hunting a
 * green — and lets the coach read it.
 */
export function parMixSentence(split: ParSplit): string | null {
  const known = split.par4.attempts + split.par5.attempts;
  if (known === 0) return null;
  if (split.par4.attempts < PAR_MIX_MIN_MINORITY || split.par5.attempts < PAR_MIX_MIN_MINORITY) {
    return null;
  }

  const par5Share = split.par5.attempts / known;
  const par4Share = split.par4.attempts / known;
  if (par5Share < PAR_MIX_DOMINANT_SHARE && par4Share < PAR_MIX_DOMINANT_SHARE) return null;

  if (par5Share >= PAR_MIX_DOMINANT_SHARE) {
    return (
      ` ${(par5Share * 100).toFixed(0)}% of these (${split.par5.attempts} of ${known}) were second shots on par 5s,` +
      ` where laying up to a wedge number is often the right play and a lay-up records as a missed green.` +
      ` On par 4s, where you have to go at it, you found the green ${split.par4.greenHitPct?.toFixed(0)}%` +
      ` of the time over ${split.par4.attempts} approaches.`
    );
  }

  return (
    ` ${(par4Share * 100).toFixed(0)}% of these (${split.par4.attempts} of ${known}) were par-4 approaches,` +
    ` where you found the green ${split.par4.greenHitPct?.toFixed(0)}% of the time;` +
    ` the ${split.par5.attempts} par-5 second shots converted ${split.par5.greenHitPct?.toFixed(0)}%.`
  );
}

interface ApproachMissAggregate extends GeneratorAggregate {
  /** Newest cache round date — feeds the staleness disclosure. */
  last_round_date: string | null;
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
  /** Par-4 vs par-5 composition of the band. See parSplit(). */
  par_split: ParSplit;
}

export class ApproachMissGenerator extends BaseGenerator<ApproachMissAggregate> {
  readonly name = 'ApproachMissGenerator';
  readonly insightType = 'approach_miss';
  readonly category: InsightCategory = 'approach';
  readonly minSampleN = 5; // attempts in the bucket
  protected override readonly requiresStanding = false;
  /**
   * ...but DO attach standing when the table has it.
   *
   * `requiresStanding: false` is right — no sourced PGA on-green-proximity
   * benchmark exists for these buckets, and inventing one is what made
   * `long_approach_3putt_cascade` unfireable. It used to also mean "never
   * load", which threw away a cohort position that already existed: measured
   * 2026-08-18, 0 of 123 active approach_miss insights carried standing while
   * `golf_player_standing` held 106 approach-proximity rows across 38 players,
   * refreshed that day.
   *
   * Attaching it also lights up the `if (standing)` branch in run(), which is
   * where the counterfactual and its `strokes_impact` are computed — the value
   * the signals feed now ranks on.
   */
  protected override readonly attachStandingWhenAvailable = true;

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
      (s) => bucketApproachDistance(s.distance_to_hole_before, s.distance_unit_before) === this.bucket,
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

    const lastRoundDate = await loadLastRoundDate(this.playerId);

    return {
      sampleN: inBucket.length,
      last_round_date: lastRoundDate,
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
      par_split: parSplit(inBucket),
    };
  }

  composeContent(agg: ApproachMissAggregate): ComposedContent {
    const label = BUCKET_LABEL[agg.bucket];
    const tourGreenHit =
      cohortAnchor(this.metricId, agg.cohort_gender) ?? TOUR_GREEN_HIT_PCT[agg.bucket];
    const tourLabel = agg.cohort_gender === 'womens' ? "women's college" : 'PGA Tour';
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
    // NO TOUR COMPARISON HERE, deliberately. `prox` is averaged over
    // GREEN-FINDING SHOTS ONLY (see aggregate()), while the Tour proximity
    // figure (research doc §2, "200+ yds: ~45+ ft") is Proximity to Hole over
    // ALL approaches from the range, misses included. Conditioning on hitting
    // the green strips out every long miss, so the two are not the same
    // quantity. Printing "you 26 ft (Tour ~45 ft)" told a coach their player
    // out-dials the Tour from 175+ yards — flattering and false. The reach
    // sentence above still carries a like-for-like comparison (green-hit % vs
    // Tour green-hit %), which is where the honest benchmark lives.
    const dialInSentence =
      prox != null
        ? ` When you do reach it you finish ${prox.toFixed(0)} ft from the hole ` +
          `(over ${agg.green_hit_n} greens) — that's the dial-in once you're on.`
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

    // The 175+ band is the one that pools a green-hunting shot with a par-5
    // lay-up; the shorter bands are green-hunting either way, so the split is
    // only worth the words where it changes the reading.
    const parMix = agg.bucket === '175_plus_ft' ? (parMixSentence(agg.par_split) ?? '') : '';

    return {
      title,
      content:
        reachSentence + dialInSentence + parMix + penaltySentence + axisSentence +
        staleDataSuffix(agg.last_round_date),
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
