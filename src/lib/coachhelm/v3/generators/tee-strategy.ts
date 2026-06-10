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
 * quality" exists today, so requiresStanding=false (no standing-backed
 * counterfactual). It measures driver-vs-non_driver fairway% dispersion,
 * a unit (percent) that does NOT match the sg_ott strokes-gained baseline,
 * so it cannot legitimately carry a standing/counterfactual without
 * fabricating a unit-mismatched gap — leave diagnostic-only. Follow-up: a
 * standing-backed tee accuracy metric (e.g. fairway% vs PGA) would let the
 * tee theme carry a real counterfactual.
 *
 * The LAGGY pattern carries a conservative diagnostic strokes_impact
 * (tee-strat-1): the BaseGenerator injects no counterfactual for a
 * requiresStanding=false generator, so a hard strokes_impact=0 makes the
 * "Driver costing you" card render "~0.0 strokes" and rank last on every
 * flat surface. The estimate (fairway gap × driver tee shots/round ×
 * conservative miss cost) is marked strokes_impact_method='rough_estimate',
 * NOT a standing-backed projection. Sharp/inconclusive stay 0 — they aren't
 * framed as costing strokes.
 *
 * Filed under category='tee' so it feeds the "Off the Tee" theme. Indexed
 * under metric_id='sg_ott' (the closest tee-game metric) so the insight
 * also surfaces under Strokes Gained Off the Tee in the UI.
 *
 * Per-team toggle: gated by golf_team_coachhelm_settings.preferences
 *   .tee_strategy_enabled — teams with sparse tee data or who don't
 * want layback alerts can opt out via the coach settings UI.
 */

import { staleDataSuffix } from '@/lib/coachhelm/v3/engine/window-honesty';
import { loadLastRoundDate } from '@/lib/coachhelm/v3/engine/hole-diagnosis';
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

/** Conservative strokes-cost of a fairway lost off the tee vs a fairway found
 *  (penalty/recovery delta, lower bound of Broadie's off-the-tee SG spread).
 *  Used ONLY for the laggy pattern's diagnostic strokes_impact (tee-strat-1) —
 *  tee strategy has no PGA standing, so the BaseGenerator never injects a
 *  counterfactual; without a value here the "Driver costing you" card renders
 *  "~0.0 strokes" and ranks last. This is a rough_estimate, not a standing-
 *  backed counterfactual. */
const FAIRWAY_MISS_COST_STROKES = 0.3;

/**
 * Diagnostic strokes-per-round estimate for the LAGGY pattern (tee-strat-1).
 * The fairway-accuracy gap the player would recover by laying back, scaled by
 * driver tee shots per round and the conservative miss cost. Non-laggy patterns
 * are NOT framed as costing strokes → 0 (correct: they rank as descriptive).
 * Pure + exported for unit testing.
 */
export function laggyDiagnosticStrokesImpact(
  fairwayGap: number,
  driverAttempts: number,
  roundsCovered: number,
): number {
  if (roundsCovered <= 0 || !Number.isFinite(fairwayGap)) return 0;
  const recoverableFwFraction = Math.max(0, -fairwayGap); // negative gap = driver worse
  const driverPerRound = driverAttempts / roundsCovered;
  const v = recoverableFwFraction * driverPerRound * FAIRWAY_MISS_COST_STROKES;
  return Number.isFinite(v) ? v : 0;
}

type TeeStrategyPattern = 'laggy' | 'sharp' | 'inconclusive';

interface GroupStats {
  attempts: number;
  fairwayHits: number;
  fairwayPct: number;
  avgDistance: number;
}

interface TeeStrategyAggregate extends GeneratorAggregate {
  /** Newest cache round date — feeds the staleness disclosure. */
  last_round_date: string | null;
  driver: GroupStats;
  nonDriver: GroupStats;
  pattern: TeeStrategyPattern;
  fairwayGap: number;
  distanceGap: number;
  roundsCovered: number;
}

function summarize(rows: TeeStrategyShot[], club: 'driver' | 'non_driver'): GroupStats {
  const subset = rows.filter((r) => r.club_type === club);
  // Fairway denominator = tee shots with a RECORDED fairway result. A null
  // fairway_hit means "not recorded" and must NOT count as a miss (canonical
  // fairway denominator: par-4/5 holes with fairway_hit IS NOT NULL).
  const recorded = subset.filter((r) => r.fairway_hit !== null);
  const attempts = recorded.length;
  const fairwayHits = recorded.filter((r) => r.fairway_hit === true).length;
  // Distance is independent of fairway recording — use every tee shot.
  const distances = subset
    .map((r) => r.shot_distance)
    .filter((d): d is number => typeof d === 'number');
  const avgDistance = distances.length
    ? distances.reduce((a, b) => a + b, 0) / distances.length
    : 0;
  return {
    attempts,
    fairwayHits,
    // attempts === 0 is unreachable in the insight path (the aggregate gate at
    // MIN_DRIVER_ATTEMPTS / MIN_NON_DRIVER_ATTEMPTS returns null first).
    fairwayPct: attempts > 0 ? fairwayHits / attempts : 0,
    avgDistance,
  };
}

export class TeeStrategyGenerator extends BaseGenerator<TeeStrategyAggregate> {
  readonly name = 'TeeStrategyGenerator';
  readonly insightType = 'tee_strategy';
  // Off-the-tee driver/layback strategy is semantically a tee insight, so
  // it must file under 'tee' to feed the "Off the Tee" theme (was
  // 'course_management', which left the tee theme permanently empty).
  // NOTE: this only affects NEWLY generated golf_coach_insights rows —
  // existing stored rows keep their old 'course_management' category until
  // a prod insight-regeneration is run.
  readonly category: InsightCategory = 'tee';
  readonly minSampleN = MIN_DRIVER_ATTEMPTS;
  // Player-vs-self — driver-strategy quality has no PGA benchmark.
  protected override readonly requiresStanding = false;
  readonly metricId: MetricId = 'sg_ott';

  /** Per-team toggle via golf_team_coachhelm_settings.preferences. */
  protected override async isEnabled(): Promise<boolean> {
    return isGeneratorEnabledForPlayer(this.playerId, 'tee_strategy_enabled');
  }

  protected override signatureScope(): string {
    return 'tee_strategy:';
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

    const lastRoundDate = await loadLastRoundDate(this.playerId);

    return {
      sampleN: driver.attempts,
      last_round_date: lastRoundDate,
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

    // Diagnostic strokes_impact for the laggy pattern (tee-strat-1): this
    // generator is requiresStanding=false, so the BaseGenerator injects no
    // counterfactual; a hard 0 here makes the "Driver costing you" card render
    // "~0.0 strokes" and rank last. Only the laggy branch is framed as a cost.
    const diagnosticStrokes =
      agg.pattern === 'laggy'
        ? laggyDiagnosticStrokesImpact(agg.fairwayGap, agg.driver.attempts, agg.roundsCovered)
        : 0;

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
      content: content + staleDataSuffix(agg.last_round_date),
      // laggy is the only branch framed as costing strokes; sharp/inconclusive are strength/neutral.
      priority: agg.pattern === 'laggy' ? 'high' : 'low',
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
        // Diagnostic estimate (tee-strat-1) — laggy only; no PGA standing exists
        // for tee strategy so this is rough_estimate, not a real counterfactual.
        strokes_impact: diagnosticStrokes,
        strokes_impact_method: 'rough_estimate',
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
