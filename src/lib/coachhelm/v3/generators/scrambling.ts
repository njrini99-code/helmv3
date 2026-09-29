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
 * The generator keeps the scrambling_pct_sand metric and attaches standing when
 * a row exists, so Phase A's StandingBar / counterfactual pipeline still runs;
 * playerValue stays the sand-save % (the registered unit). A missing standing
 * row no longer hides the card (audit row 28: requiresStanding=false).
 */

import { staleDataSuffix } from '@/lib/coachhelm/v3/engine/window-honesty';
import { loadLastRoundDate } from '@/lib/coachhelm/v3/engine/hole-diagnosis';
import { round } from '@/lib/golf/stat-formulas';
import { BaseGenerator } from '@/lib/coachhelm/v3/engine/generator-base';
import { loadSandShots, type SandShot } from '@/lib/coachhelm/v3/engine/shot-source';
import { loadPlayerCohort } from '@/lib/coachhelm/v3/counterfactual/player-cohort-loader';
import {
  cohortAnchor,
  cohortAnchorLabel,
  cohortAnchorSource,
  type CohortGender,
} from '@/lib/coachhelm/v3/counterfactual/cohort-baselines';
import { wilsonInterval } from '@/lib/coachhelm/v3/stats/intervals';
import type {
  ComposedContent,
  GeneratorAggregate,
  InsightCategory,
  MetricId,
} from '@/lib/coachhelm/v3/engine/types';

type ScramblingLie = 'sand';

type ScramblingFailureMode = 'escape' | 'lag' | 'mixed';

interface ScramblingAggregate extends GeneratorAggregate {
  /** Newest cache round date — feeds the staleness disclosure. */
  last_round_date: string | null;
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
  /** Denominator of `playerValue`: bunker HOLES (flag source) or sand shots
   *  (heuristic source). This, not the shot count, is the card's n. */
  save_n: number;
  /** Numerator of `playerValue`. */
  saves_made: number;
  /** Which definition produced the save rate. */
  save_source: 'hole_flag' | 'shot_heuristic';
}

/** Escape share below which the leak is getting out of the sand at all. */
const ESCAPE_LEAK_RATE = 0.55;

/**
 * Pure failure-mode rule (audit row 28 — exported so the classification can be
 * recomputed from raw shots in a test). ESCAPE when fewer than 55% of sand
 * shots reached the green; LAG when most escape but at least half of the
 * reached greens became 2-putts (with at least 3 reached); MIXED otherwise.
 * A decision rule, not a statistical test — the card says what it measured.
 */
export function classifyBunkerFailureMode(input: {
  attempts: number;
  reachedN: number;
  twoPuttAfterReachN: number;
}): ScramblingFailureMode {
  const { attempts, reachedN, twoPuttAfterReachN } = input;
  if (attempts <= 0) return 'mixed';
  if (reachedN / attempts < ESCAPE_LEAK_RATE) return 'escape';
  if (reachedN >= 3 && twoPuttAfterReachN / reachedN >= 0.5) return 'lag';
  return 'mixed';
}

/**
 * Pure sand-save summary. With golf_holes.sand_save flags present, one save
 * opportunity per bunker HOLE (a hole with two sand shots is one chance, not
 * two — the old per-shot count double-counted it, audit row 28). Without any
 * flag, the shot-derived fallback: a sand shot that reached the green and was
 * followed by at most one putt.
 */
export function summarizeSandSaves(
  shots: readonly SandShot[],
): { made: number; n: number; source: 'hole_flag' | 'shot_heuristic' } {
  const byHole = new Map<string, boolean>();
  for (const s of shots) {
    if (s.sand_save_flag === null || s.sand_save_flag === undefined) continue;
    byHole.set(`${s.round_id}:${s.hole_number}`, s.sand_save_flag === true);
  }
  if (byHole.size > 0) {
    let made = 0;
    for (const v of byHole.values()) if (v) made += 1;
    return { made, n: byHole.size, source: 'hole_flag' };
  }
  const made = shots.filter((s) => s.reached_green && s.putts_after <= 1).length;
  return { made, n: shots.length, source: 'shot_heuristic' };
}

const LIE_TO_METRIC_ID: Record<ScramblingLie, MetricId> = {
  sand: 'scrambling_pct_sand',
};

export class ScramblingGenerator extends BaseGenerator<ScramblingAggregate> {
  readonly name = 'ScramblingGenerator';
  readonly insightType = 'scrambling';
  readonly category: InsightCategory = 'short_game';
  readonly minSampleN = 5; // save opportunities — a sand-save % off 1-2 bunker holes is noise

  // Descriptive card (audit row 28): it measures the player's own bunker
  // outcomes, so a missing scrambling_pct_sand standing row must not hide it.
  // Standing still attaches (StandingBar, counterfactual) when it exists.
  protected override readonly requiresStanding = false;
  protected override readonly attachStandingWhenAvailable = true;

  readonly metricId: MetricId;
  readonly lie: ScramblingLie;

  constructor(playerId: string, lie: ScramblingLie = 'sand') {
    super(playerId);
    this.lie = lie;
    this.metricId = LIE_TO_METRIC_ID[lie];
  }

  protected override signatureScope(): string {
    return `scrambling:${this.lie}`;
  }

  async aggregate(): Promise<ScramblingAggregate | null> {
    const shots = await loadSandShots(this.playerId);
    if (shots.length === 0) return null;

    const attempts = shots.length;
    const reached = shots.filter((s) => s.reached_green);
    const reachedN = reached.length;
    const failedN = attempts - reachedN;

    // Sand save % — reconcile with the displayed `sand_save_percentage`:
    // golf_holes.sand_save, one opportunity per bunker hole. Shot-derived
    // fallback only when no flag is recorded (summarizeSandSaves).
    const saves = summarizeSandSaves(shots);
    if (saves.n === 0) return null;
    const playerValue = round((100 * saves.made) / saves.n, 1);

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
    const failureMode = classifyBunkerFailureMode({
      attempts,
      reachedN,
      twoPuttAfterReachN: twoPuttAfterReach,
    });

    const lastRoundDate = await loadLastRoundDate(this.playerId);

    return {
      last_round_date: lastRoundDate,
      // n is the rate's own denominator (bunker holes), so the base-class
      // floor and the printed sample describe the same thing.
      sampleN: saves.n,
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
      save_n: saves.n,
      saves_made: saves.made,
      save_source: saves.source,
    };
  }

  composeContent(agg: ScramblingAggregate): ComposedContent {
    const saveDisp = `${Math.round(agg.playerValue)}%`;
    const escapePct = agg.attempts > 0 ? Math.round((100 * agg.reached_green_n) / agg.attempts) : 0;
    const leaveDisp = agg.avg_leave_feet != null ? `${Math.round(agg.avg_leave_feet)} ft` : null;

    const anchor = cohortAnchor('scrambling_pct_sand', agg.cohort_gender) ?? 50;
    // Women's anchor is a derived target (LPGA/NCAA figures discounted to
    // college), not a measured college average — the label and source say so.
    const anchorLabel = cohortAnchorLabel(agg.cohort_gender, 'sand save');

    let title: string;
    let driver: string;
    if (agg.failure_mode === 'lag' && leaveDisp) {
      // Headline-inversion: escape is fine, the leak is distance control + lag.
      title = `Bunkers: it's the lag, not the escape (${saveDisp} up-and-down)`;
      driver =
        `You ESCAPE the bunker fine (${escapePct}% of your ${agg.attempts} sand shots reached ` +
        `the green), but you finish ${leaveDisp} from the hole and then 2-putt ` +
        `(${agg.two_putt_after_reach_n} of ${agg.reached_green_n} reached greens). The driver is ` +
        `distance control OUT of the sand and the lag putt that follows, not your splash. ` +
        `Drill: bunker shots to a 6-ft circle (carry-to-rollout control), then 10-20 ft lag putts.`;
    } else if (agg.failure_mode === 'escape') {
      title = `Bunkers: escape is the leak (${saveDisp} up-and-down)`;
      driver =
        `You're leaving balls in the bunker: only ${escapePct}% of your ${agg.attempts} sand shots ` +
        `reached the green. Before distance control, fix the escape: open the face, ` +
        `splash a full cushion of sand under the ball, and accelerate through. ` +
        `Drill: dollar-bill splash drill until 9/10 escape the lip.`;
    } else {
      title = `Sand save rate: ${saveDisp}`;
      driver =
        `Across ${agg.rounds_played} rounds you got up-and-down ${saveDisp} of the time from sand ` +
        `(${agg.attempts} attempts, ${escapePct}% reached the green). No single failure mode ` +
        `dominates yet. Keep logging bunker shots to sharpen the read.`;
    }

    // A 5-hole rate moves 20 points per hole; print its 95% range beside it.
    const ci = wilsonInterval(agg.saves_made, agg.save_n);
    const saveNoun = agg.save_source === 'hole_flag' ? 'bunker hole' : 'sand shot';
    const rangeClause = ci
      ? ` Sand saves: ${agg.saves_made} of ${agg.save_n} ${saveNoun}${agg.save_n === 1 ? '' : 's'} ` +
        `(95% range ${Math.round(ci.low)}-${Math.round(ci.high)}%).`
      : '';
    const content =
      `${driver}${rangeClause} ${agg.cohort_gender === 'womens'
        ? `Women's college sand-save target is ~${anchor}% (estimated).`
        : `Tour sand-save average is ~${anchor}%.`}` +
      staleDataSuffix(agg.last_round_date);

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
        comparison_source: cohortAnchorSource(agg.cohort_gender),
        sample_n: agg.save_n,
        // Phase E: scrambling is a SHOT-SOURCE engine — loadSandShots genuinely
        // windows the last 90 days (golf_shots via golf_rounds.round_date >= now-90d),
        // UNLIKE the cache-backed putt/par generators whose cache aggregates a
        // player's entire history. So window_days:90 is HONEST here and must STAY 90;
        // do NOT swap it for a lifetime span (that would misreport a real 90d window).
        window_days: 90,
        window_start: '',
        // The newest contributing round. This was hardcoded '' while the same
        // `agg.last_round_date` was being rendered into the prose by
        // `staleDataSuffix` — the date was on the aggregate and in the
        // sentence, but never in the field a consumer can read. Measured
        // 2026-08-18: of 287 active insights from the five generators that
        // disclose staleness, only course_management's 47 carried a
        // window_end; the other 240 were blank, 195 of them WITH a "Data
        // through <date>" sentence built from this very value.
        //
        // `window_start` stays '' deliberately: this aggregate does not carry
        // a first_round_date, and inventing one would be worse than an honest
        // blank. `window_days` above is already the true span via
        // lifetimeSpanDays().
        window_end: agg.last_round_date ?? '',
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
          sand_shots: agg.attempts,
          save_n: agg.save_n,
          saves_made: agg.saves_made,
          save_source: agg.save_source,
          save_ci_95: ci ? { low: ci.low, high: ci.high } : null,
        },
      },
    };
  }
}
