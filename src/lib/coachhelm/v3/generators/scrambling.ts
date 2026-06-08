/**
 * v3 ScramblingGenerator (W22 → B4).
 *
 * Reads SHOT-LEVEL greenside-bunker shots (via loadSandShots) and splits the
 * failure mode so the WHY + drill name the RIGHT leak:
 *   - escape-dominant  → balls left in the bunker → splash-technique drill.
 *   - lag-dominant     → escape is fine, the leak is distance control OUT of the
 *                        sand + the lag putt that follows → proximity + lag drill.
 *
 * The headline-inversion case (Nick Rini): he escapes ~90% of greenside bunkers
 * but finishes ~11-14 ft away and 2-putts, so his sand-save % is low for the
 * OPPOSITE reason to the naive read — it's lag/proximity, not the splash.
 *
 * RECONCILIATION (sand-save % must match the displayed stat surfaces):
 *   - Denominator: loadSandShots is scoped to GREENSIDE bunkers (around_green or
 *     <=50yd, non-approach), matching the engine's `sand_save_percentage`
 *     denominator (aroundGreenShot). Fairway-bunker approaches are excluded.
 *   - Numerator: playerValue reads the canonical golf_holes.sand_save flag (the
 *     SAME source the DB cache + stat-formulas use). When no flags are recorded
 *     (e.g. unit tests, legacy rows) it falls back to a shot-derived
 *     up-and-down heuristic (reached the green AND <=1 putt after).
 *
 * The generator keeps requiresStanding=true + the scrambling_pct_sand metric, so
 * Phase A's StandingBar / counterfactual / backfill pipeline runs unchanged;
 * playerValue stays the sand-save % (the registered unit). The new diagnosis
 * only changes the prose + the priority hint feeding Phase A's floor.
 */

import { round } from '@/lib/golf/stat-formulas';
import { BaseGenerator } from '@/lib/coachhelm/v3/engine/generator-base';
import { loadSandShots, type SandShot } from '@/lib/coachhelm/v3/engine/shot-source';
import { loadPlayerCohort } from '@/lib/coachhelm/v3/counterfactual/player-cohort-loader';
import { cohortAnchor, type CohortGender } from '@/lib/coachhelm/v3/counterfactual/cohort-baselines';
import type {
  ComposedContent,
  GeneratorAggregate,
  InsightCategory,
  MetricId,
} from '@/lib/coachhelm/v3/engine/types';

type ScramblingLie = 'sand';

type ScramblingFailureMode = 'escape' | 'lag' | 'mixed';

interface ScramblingAggregate extends GeneratorAggregate {
  lie: ScramblingLie;
  attempts: number;
  rounds_played: number;
  /** Bunker shots that reached the green. */
  reached_green_n: number;
  /** Bunker shots that never reached the green. */
  failed_escape_n: number;
  /** Avg leave (feet) over the shots that reached the green; null if none. */
  avg_leave_feet: number | null;
  /** Of the reached-green shots, how many became a 2-putt-or-worse. */
  two_putt_after_reach_n: number;
  /** Which failure dominates: never escaping vs reaching-then-lagging. */
  failure_mode: ScramblingFailureMode;
  /** Cohort gender resolved in aggregate() — selects the anchor + copy. */
  cohort_gender: CohortGender;
  /** Player's own sand attempts per round (attempts / rounds_played). */
  attempts_per_round: number;
}

const LIE_TO_METRIC_ID: Record<ScramblingLie, MetricId> = {
  sand: 'scrambling_pct_sand',
};

export class ScramblingGenerator extends BaseGenerator<ScramblingAggregate> {
  readonly name = 'ScramblingGenerator';
  readonly insightType = 'scrambling';
  readonly category: InsightCategory = 'short_game';
  readonly minSampleN = 5; // sand ATTEMPTS — a sand-save % off 1-2 bunker shots is noise

  readonly metricId: MetricId;
  readonly lie: ScramblingLie;

  constructor(playerId: string, lie: ScramblingLie = 'sand') {
    super(playerId);
    this.lie = lie;
    this.metricId = LIE_TO_METRIC_ID[lie];
  }

  async aggregate(): Promise<ScramblingAggregate | null> {
    const shots = await loadSandShots(this.playerId);
    if (shots.length === 0) return null;

    const attempts = shots.length;
    const reached = shots.filter((s) => s.reached_green);
    const reachedN = reached.length;
    const failedN = attempts - reachedN;

    // Sand save % — reconcile with the displayed `sand_save_percentage`.
    // Authoritative source = golf_holes.sand_save flag (the SAME the DB cache +
    // stat-formulas use): attempt = flag non-null, made = flag === true. Fall
    // back to a shot-derived up-and-down (reached the green AND <=1 putt after,
    // holed counts) ONLY when no hole flags are recorded.
    const flagged = shots.filter((s): s is SandShot & { sand_save_flag: boolean } =>
      s.sand_save_flag !== null && s.sand_save_flag !== undefined,
    );
    let playerValue: number;
    if (flagged.length > 0) {
      const savesN = flagged.filter((s) => s.sand_save_flag === true).length;
      playerValue = round((100 * savesN) / flagged.length, 1);
    } else {
      const savesN = reached.filter((s) => s.putts_after <= 1).length;
      playerValue = round((100 * savesN) / attempts, 1);
    }

    const leaves = reached
      .map((s) => s.leave_distance_feet)
      .filter((d): d is number => typeof d === 'number' && Number.isFinite(d));
    const avgLeave = leaves.length > 0 ? round(leaves.reduce((a, d) => a + d, 0) / leaves.length, 1) : null;
    const twoPuttAfterReach = reached.filter((s) => s.putts_after >= 2).length;
    const roundsPlayed = new Set(shots.map((s) => s.round_id)).size;
    const cohort = await loadPlayerCohort(this.playerId);
    const attemptsPerRound = roundsPlayed > 0 ? attempts / roundsPlayed : 0;

    // Failure mode: if a meaningful share never reaches the green it's an ESCAPE
    // problem; if most reach but don't get up-and-down it's a LAG/proximity
    // problem (Nick: 90% reach, single-digit up-and-down → lag). Mixed when
    // neither clearly dominates.
    const escapeRate = reachedN / attempts; // share that DID escape
    let failureMode: ScramblingFailureMode;
    if (escapeRate < 0.55) {
      failureMode = 'escape';
    } else if (reachedN >= 3 && twoPuttAfterReach / reachedN >= 0.5) {
      failureMode = 'lag';
    } else {
      failureMode = 'mixed';
    }

    return {
      sampleN: attempts,
      playerValue,
      lie: this.lie,
      attempts,
      rounds_played: roundsPlayed,
      reached_green_n: reachedN,
      failed_escape_n: failedN,
      avg_leave_feet: avgLeave,
      two_putt_after_reach_n: twoPuttAfterReach,
      failure_mode: failureMode,
      cohort_gender: cohort.gender,
      attempts_per_round: attemptsPerRound,
    };
  }

  composeContent(agg: ScramblingAggregate): ComposedContent {
    const saveDisp = `${Math.round(agg.playerValue)}%`;
    const escapePct = agg.attempts > 0 ? Math.round((100 * agg.reached_green_n) / agg.attempts) : 0;
    const leaveDisp = agg.avg_leave_feet != null ? `${Math.round(agg.avg_leave_feet)} ft` : null;

    const anchor = cohortAnchor('scrambling_pct_sand', agg.cohort_gender) ?? 50;
    const anchorLabel = agg.cohort_gender === 'womens'
      ? "women's college sand-save avg"
      : 'PGA Tour sand save avg';

    let title: string;
    let driver: string;
    if (agg.failure_mode === 'lag' && leaveDisp) {
      // Headline-inversion: escape is fine, the leak is distance control + lag.
      title = `Bunkers: it's the lag, not the escape (${saveDisp} up-and-down)`;
      driver =
        `You ESCAPE the bunker fine — ${escapePct}% of your ${agg.attempts} sand shots reached ` +
        `the green — but you finish ${leaveDisp} from the hole and then 2-putt ` +
        `(${agg.two_putt_after_reach_n} of ${agg.reached_green_n} reached greens). The driver is ` +
        `distance control OUT of the sand and the lag putt that follows, not your splash. ` +
        `Drill: bunker shots to a 6-ft circle (carry-to-rollout control), then 10-20 ft lag putts.`;
    } else if (agg.failure_mode === 'escape') {
      title = `Bunkers: escape is the leak (${saveDisp} up-and-down)`;
      driver =
        `You're leaving balls in the bunker — only ${escapePct}% of your ${agg.attempts} sand shots ` +
        `reached the green. Before distance control, fix the escape: open the face, ` +
        `splash a full cushion of sand under the ball, and accelerate through. ` +
        `Drill: dollar-bill splash drill until 9/10 escape the lip.`;
    } else {
      title = `Sand save rate: ${saveDisp}`;
      driver =
        `Across ${agg.rounds_played} rounds you got up-and-down ${saveDisp} of the time from sand ` +
        `(${agg.attempts} attempts, ${escapePct}% reached the green). No single failure mode ` +
        `dominates yet — keep logging bunker shots to sharpen the read.`;
    }

    const content = `${driver} ${agg.cohort_gender === 'womens' ? "Women's college" : 'Tour'} sand-save average is ~${anchor}%.`;

    return {
      title,
      content,
      // A clear escape/lag leak is actionable; mixed is descriptive. Phase A's
      // leveragePriorityFloor can still upgrade from the counterfactual.
      priority: agg.failure_mode === 'mixed' ? 'low' : 'medium',
      signature: `scrambling:${agg.lie}`,
      evidence: {
        metric: this.metricId,
        metric_label: 'Sand Save %',
        unit: 'percent',
        your_value: agg.playerValue,
        your_value_display: saveDisp,
        comparison_value: anchor,
        comparison_label: anchorLabel,
        comparison_source: 'pga_baseline',
        sample_n: agg.attempts,
        window_days: 90,
        window_start: '',
        window_end: '',
        strokes_impact: 0,
        strokes_impact_method: 'peer_delta',
        confidence: 0,
        confidence_factors: {
          sample_adequacy: Math.min(agg.attempts / 20, 1),
          recency: 1.0,
          variance: 0.5,
        },
        // Structured diagnosis for downstream composites / themes.
        detail: {
          failure_mode: agg.failure_mode,
          escape_pct: escapePct,
          avg_leave_feet: agg.avg_leave_feet,
          reached_green_n: agg.reached_green_n,
          two_putt_after_reach_n: agg.two_putt_after_reach_n,
        },
      },
    };
  }
}
