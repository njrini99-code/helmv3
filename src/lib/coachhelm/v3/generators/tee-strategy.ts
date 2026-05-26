/**
 * v3 TeeStrategyGenerator (W43 — closes the W23 deferral).
 *
 * Ports the v2 generator at `v2/mining/tee-strategy.ts` into the
 * BaseGenerator pattern. Reads tee shots (par-4/5 only) via the
 * shot-source helper and compares driver-vs-non_driver fairway% +
 * distance gap to detect two patterns:
 *
 *   (a) Driver laggy   — driver fairway% trails non-driver by ≥15pp
 *                        AND distance gap < 35yd → "lay back more"
 *   (b) Driver sharp   — driver fairway% within 5pp of non-driver
 *                        → "default driver more often"
 *
 * Thresholds + sample-size gates (driver ≥ 15 attempts,
 * non-driver ≥ 8) are calibrated per the 2026-04-22 insight-quality
 * design contract (see docs/superpowers/plans/).
 *
 * Player-vs-self diagnostic — no PGA benchmark for "driver strategy
 * quality" exists today, so requiresStanding=false. Indexed under
 * metric_id='sg_ott' (the closest tee-game metric) so the insight
 * surfaces under Strokes Gained Off the Tee in the UI.
 *
 * Per-team toggle: gated by golf_team_coachhelm_settings.preferences
 *   .tee_strategy_enabled — teams with sparse tee data or who don't
 * want layback alerts can opt out via the coach settings UI.
 */

import { BaseGenerator } from '@/lib/coachhelm/v3/engine/generator-base';
import { loadTeeShotsForStrategy, type TeeStrategyShot } from '@/lib/coachhelm/v3/engine/shot-source';
import { isGeneratorEnabledForPlayer } from '@/lib/coachhelm/v3/foundation/generator-toggles';
import type {
  ComposedContent,
  GeneratorAggregate,
  InsightCategory,
  MetricId,
} from '@/lib/coachhelm/v3/engine/types';

const WINDOW_DAYS = 90;
const MIN_DRIVER_ATTEMPTS = 15;
const MIN_NON_DRIVER_ATTEMPTS = 8;
/** Driver fairway% must trail non-driver by at least this many pp to
 *  fire the "laggy" insight. 0.15 = 15 percentage points. */
const LAGGY_FW_GAP = 0.15;
/** ...AND distance gap (driver − non-driver) must be less than this
 *  many yards for the layback to be obviously worth it. */
const LAGGY_DISTANCE_GAP = 35;
/** Driver fairway% within this many pp of non-driver triggers the
 *  "sharp" reinforcement insight. Negative because driver can BEAT
 *  non-driver: gap >= -0.05 means driver is at most 5pp worse. */
const SHARP_FW_GAP = -0.05;

type TeeStrategyPattern = 'laggy' | 'sharp' | 'inconclusive';

interface GroupStats {
  attempts: number;
  fairwayHits: number;
  fairwayPct: number;
  avgDistance: number;
}

interface TeeStrategyAggregate extends GeneratorAggregate {
  driver: GroupStats;
  nonDriver: GroupStats;
  pattern: TeeStrategyPattern;
  fairwayGap: number;
  distanceGap: number;
  roundsCovered: number;
}

function summarize(rows: TeeStrategyShot[], club: 'driver' | 'non_driver'): GroupStats {
  const subset = rows.filter((r) => r.club_type === club);
  const attempts = subset.length;
  const fairwayHits = subset.filter((r) => r.fairway_hit).length;
  const distances = subset
    .map((r) => r.shot_distance)
    .filter((d): d is number => typeof d === 'number');
  const avgDistance = distances.length
    ? distances.reduce((a, b) => a + b, 0) / distances.length
    : 0;
  return {
    attempts,
    fairwayHits,
    fairwayPct: attempts > 0 ? fairwayHits / attempts : 0,
    avgDistance,
  };
}

export class TeeStrategyGenerator extends BaseGenerator<TeeStrategyAggregate> {
  readonly name = 'TeeStrategyGenerator';
  readonly insightType = 'tee_strategy';
  readonly category: InsightCategory = 'course_management';
  readonly minSampleN = MIN_DRIVER_ATTEMPTS;
  // Player-vs-self — driver-strategy quality has no PGA benchmark.
  protected override readonly requiresStanding = false;
  readonly metricId: MetricId = 'sg_ott';

  /** Per-team toggle via golf_team_coachhelm_settings.preferences. */
  protected override async isEnabled(): Promise<boolean> {
    return isGeneratorEnabledForPlayer(this.playerId, 'tee_strategy_enabled');
  }

  async aggregate(): Promise<TeeStrategyAggregate | null> {
    const rows = await loadTeeShotsForStrategy(this.playerId, WINDOW_DAYS);
    if (rows.length === 0) return null;

    const driver = summarize(rows, 'driver');
    const nonDriver = summarize(rows, 'non_driver');

    if (
      driver.attempts < MIN_DRIVER_ATTEMPTS ||
      nonDriver.attempts < MIN_NON_DRIVER_ATTEMPTS
    ) {
      return null;
    }

    const fairwayGap = driver.fairwayPct - nonDriver.fairwayPct; // negative if driver is worse
    const distanceGap = driver.avgDistance - nonDriver.avgDistance;

    let pattern: TeeStrategyPattern = 'inconclusive';
    if (fairwayGap <= -LAGGY_FW_GAP && distanceGap < LAGGY_DISTANCE_GAP) {
      pattern = 'laggy';
    } else if (fairwayGap >= SHARP_FW_GAP) {
      pattern = 'sharp';
    }

    const roundIds = new Set(rows.map((r) => r.round_id));

    return {
      sampleN: driver.attempts,
      playerValue: driver.fairwayPct * 100, // percent for display
      driver,
      nonDriver,
      pattern,
      fairwayGap,
      distanceGap,
      roundsCovered: roundIds.size,
    };
  }

  composeContent(agg: TeeStrategyAggregate): ComposedContent {
    const driverFw = Math.round(agg.driver.fairwayPct * 100);
    const ndFw = Math.round(agg.nonDriver.fairwayPct * 100);
    const distGap = Math.round(agg.distanceGap);
    const fwGapPp = Math.round(Math.abs(agg.fairwayGap) * 100);

    let title: string;
    let content: string;

    if (agg.pattern === 'laggy') {
      title = 'Driver may be costing you more than it gains';
      content =
        `Over the last ${agg.roundsCovered} rounds your driver finds the ` +
        `fairway ${driverFw}% of the time (${agg.driver.attempts} attempts) ` +
        `vs ${ndFw}% with your tee fairway clubs (${agg.nonDriver.attempts} ` +
        `attempts) — a ${fwGapPp}pp accuracy gap. Average distance gain is ` +
        `only ${distGap} yards. On par-4/5 holes where driver isn't pinning ` +
        `you to a much better approach distance, the layback is the higher-EV play.`;
    } else if (agg.pattern === 'sharp') {
      title = 'Driver is performing — keep it in play';
      content =
        `Across the last ${agg.roundsCovered} rounds your driver fairway% ` +
        `(${driverFw}%) is within ${fwGapPp}pp of your other tee clubs ` +
        `(${ndFw}%) while gaining ${distGap} yards on average. This is the ` +
        `right risk/reward signature — default to driver on par-4/5 tees ` +
        `unless trouble makes the layback obvious.`;
    } else {
      // Inconclusive — neither pattern fires. We still emit a brief
      // "no clear bias" insight so the coach knows we've looked at it
      // and that no action is recommended right now.
      title = 'Driver vs layback: no clear preference';
      content =
        `Across ${agg.roundsCovered} rounds your driver (${driverFw}% fw, ` +
        `${agg.driver.attempts} attempts) and tee fairway clubs (${ndFw}% fw, ` +
        `${agg.nonDriver.attempts} attempts) are tracking close enough that ` +
        `neither the layback nor the driver-default insight crosses the ` +
        `evidence threshold. Course-by-course strategy can still help; ` +
        `the data doesn't show a universal preference yet.`;
    }

    return {
      title,
      content,
      signature: `tee_strategy:${agg.pattern}`,
      evidence: {
        metric: this.metricId,
        metric_label: 'Tee Strategy',
        unit: 'percent',
        your_value: agg.driver.fairwayPct * 100,
        your_value_display: `${driverFw}%`,
        comparison_value: agg.nonDriver.fairwayPct * 100,
        comparison_label: 'Non-driver fairway%',
        comparison_source: 'your_baseline',
        sample_n: agg.driver.attempts + agg.nonDriver.attempts,
        window_days: WINDOW_DAYS,
        window_start: '',
        window_end: '',
        strokes_impact: 0,
        strokes_impact_method: 'peer_delta',
        confidence: 0,
        confidence_factors: {
          sample_adequacy: Math.min(agg.driver.attempts / 25, 1),
          recency: 1.0,
          variance: 0.5,
        },
      },
    };
  }
}
