/**
 * CoachHelm BASEBALL composite rules (V10).
 *
 * docs/.../25_premium_ui_coachhelm_v10 §"Composite Rules" + 20_..._v6
 * §"Causal and Counterfactual Layer". A composite combines MULTIPLE single-
 * metric signals into one higher-value coaching decision that no single
 * generator can make alone. Composites are where the engine earns its
 * "premium college-baseball quality" bar — they prove a cross-domain pattern,
 * not a one-metric blip.
 *
 * The three V10 composites the lite data supports today:
 *
 *   A. pitcherCommandDecayComposite — command fraying (walks/strike%) CO-OCCURS
 *      with a readiness/soreness flag and/or recent heavy workload. The combined
 *      signal is far more actionable than command alone ("rest first, mechanics
 *      second"). Multiple CO-OCCURRING factors can lift it to observed_sequence
 *      caution, but it stays an inferred_hypothesis about CAUSE.
 *   B. hitterTranslationGapComposite — high practice contact + low game contact
 *      + elevated chase, with NO readiness excuse → "practice quality isn't
 *      translating; add game-pressure reps", not "work on your swing".
 *   C. liftToFieldRiskComposite — elevated lift RPE / low readiness next to a
 *      pitching workload flag → a strength-staff visibility flag so a heavy lift
 *      isn't stacked on a high-intent throwing day.
 *
 * HONESTY: composites NEVER claim medical causation. They state the co-occurring
 * facts, label the cause an inferred hypothesis, and recommend a review action.
 * They DEMOTE to nothing when the corroborating factor is absent (the value of a
 * composite is precisely that it requires the combination).
 *
 * Each composite returns at most ONE candidate per player and carries the
 * source refs of EVERY contributing metric so the Source Drawer shows the full
 * evidence chain.
 */

import type { Diagnosis, DiagnosisDriver } from '@/lib/coachhelm/shared/evidence-types';
import type { BaseballInsightSourceRef } from '@/lib/types/baseball-coachhelm';
import { getBaseballMetricThreshold } from '../metrics/registry';
import type { LoadedMetric, LoadedPlayerMetrics } from '../loaders';
import {
  type BaseballInsightCandidate,
  driver,
  gate,
  clampThinSample,
  playerVisibleFor,
  pct,
  r2,
} from './index';

/** Build the evidence bundle for a composite from N contributing metrics. */
function compositeEvidence(
  primary: LoadedMetric,
  contributors: LoadedMetric[],
  diagnosis: Diagnosis,
): BaseballInsightCandidate['evidence'] {
  const refs: BaseballInsightSourceRef[] = contributors.flatMap((m) => m.source_refs);
  return {
    sample_n: primary.sample_n,
    target_n: primary.target_n,
    confidence_factors: primary.confidence_factors,
    diagnosis,
    causality_level: 'inferred_hypothesis',
    source_refs: refs,
  };
}

/** Lowest confidence across contributors — a composite is only as trustworthy
 *  as its weakest leg (never inflate by averaging up a thin leg). */
function weakestConfidence(metrics: LoadedMetric[]): number {
  return metrics.reduce((min, m) => Math.min(min, m.confidence), 1);
}

// =============================================================================
// A. PITCHER COMMAND DECAY COMPOSITE
//    command fraying + (readiness flag OR recent workload over ceiling)
// =============================================================================

export function pitcherCommandDecayComposite(
  player: LoadedPlayerMetrics,
): BaseballInsightCandidate[] {
  const wpi = player.metrics.walks_per_inning;
  const strikePct = player.metrics.strike_pct;

  const commandHit =
    (wpi?.value != null && wpi.value >= getBaseballMetricThreshold('walks_per_inning')) ||
    (strikePct?.value != null && strikePct.value <= getBaseballMetricThreshold('strike_pct'));
  if (!commandHit) return [];

  const command: LoadedMetric | undefined =
    wpi?.value != null && wpi.value >= getBaseballMetricThreshold('walks_per_inning') ? wpi : strikePct;
  if (!command || command.value == null) return [];

  // Corroborating factor: a readiness flag OR a workload breach. WITHOUT one of
  // these this is NOT a composite — the single-metric command generator already
  // covers bare command. So require corroboration.
  const soreness = player.metrics.soreness_level;
  const arm = player.metrics.arm_status_level;
  const pitches = player.metrics.rolling_pitch_count;
  const innings = player.metrics.rolling_innings;

  const readinessFlag =
    (soreness?.value != null && soreness.value >= getBaseballMetricThreshold('soreness_level')) ||
    (arm?.value != null && arm.value >= getBaseballMetricThreshold('arm_status_level'));
  const workloadFlag =
    (pitches?.value != null && pitches.value > getBaseballMetricThreshold('rolling_pitch_count')) ||
    (innings?.value != null && innings.value > getBaseballMetricThreshold('rolling_innings'));

  if (!readinessFlag && !workloadFlag) return [];

  const contributors: LoadedMetric[] = [command];
  const drivers: DiagnosisDriver[] = [driver(command)];
  const reasons: string[] = [];
  if (readinessFlag) {
    const rm = (arm?.value != null && arm.value >= getBaseballMetricThreshold('arm_status_level') ? arm : soreness)!;
    contributors.push(rm);
    drivers.push(driver(rm));
    reasons.push(rm.metric === 'arm_status_level' ? `arm status escalated` : `soreness ${rm.value}/5`);
  }
  if (workloadFlag) {
    const wm = (pitches?.value != null && pitches.value > getBaseballMetricThreshold('rolling_pitch_count') ? pitches : innings)!;
    contributors.push(wm);
    drivers.push(driver(wm));
    reasons.push(wm.metric === 'rolling_pitch_count' ? `${Math.round(wm.value!)} pitches/7d` : `${r2(wm.value!)} innings/7d`);
  }

  const confidence = weakestConfidence(contributors);
  // Co-occurrence with a workload/readiness flag is more serious than command
  // alone → eligible for high, still gated + thin-clamped on the command leg.
  const priority = clampThinSample(gate('high', confidence), command.metric, command.sample_n);

  const commandDesc =
    command.metric === 'walks_per_inning'
      ? `${r2(command.value)} walks/inning`
      : `${pct(command.value)} strikes`;

  const diagnosis: Diagnosis = {
    symptom: `Command is fraying (${commandDesc}) at the same time as ${reasons.join(' + ')}.`,
    root_cause:
      'Command loss co-occurring with fatigue/workload markers points to a load-driven decline, not a pure mechanical one. Cause is an inferred hypothesis from co-occurring signals, not a medical finding.',
    causality_level: 'inferred_hypothesis',
    drivers,
    recommended_action:
      'Manage workload FIRST: build in rest and cap the next outing before changing mechanics. Re-check command after the pitcher is fresh.',
    confidence_reason: `command + ${reasons.length} corroborating factor(s); composite confidence = weakest leg (${confidence.toFixed(2)})`,
  };

  return [
    {
      generator: 'composite_command_decay',
      playerId: player.playerId,
      insightType: 'coachhelm_composite_command_decay',
      title: 'Command decay under load',
      body: `Command slipping (${commandDesc}) alongside ${reasons.join(' + ')}. Manage load before mechanics.`,
      priority,
      confidence,
      playerVisible: playerVisibleFor(contributors.flatMap((m) => m.source_refs)),
      evidence: compositeEvidence(command, contributors, diagnosis),
    },
  ];
}

// =============================================================================
// B. HITTER TRANSLATION GAP COMPOSITE
//    negative game-vs-practice gap + elevated chase (proxy), NO readiness excuse
// =============================================================================

export function hitterTranslationGapComposite(
  player: LoadedPlayerMetrics,
): BaseballInsightCandidate[] {
  const gap = player.metrics.game_practice_avg_delta;
  const chase = player.metrics.two_strike_chase_pct;

  const gapHit = gap?.value != null && gap.value <= getBaseballMetricThreshold('game_practice_avg_delta');
  const chaseHit = chase?.value != null && chase.value >= getBaseballMetricThreshold('two_strike_chase_pct');
  if (!gapHit || !chaseHit || gap?.value == null || chase?.value == null) return [];

  // A readiness flag would make this a readiness story, not a translation story —
  // the composite's value is isolating "no excuse, it's a pressure/approach gap".
  const soreness = player.metrics.soreness_level;
  const readinessExcuse = soreness?.value != null && soreness.value >= getBaseballMetricThreshold('soreness_level');
  if (readinessExcuse) return [];

  const contributors = [gap, chase];
  const confidence = weakestConfidence(contributors);
  const priority = clampThinSample(gate('medium', confidence), gap.metric, gap.sample_n);
  const points = Math.round(Math.abs(gap.value) * 1000);

  const diagnosis: Diagnosis = {
    symptom: `Game average is ${points} points below practice AND two-strike chase is elevated (${pct(chase.value)}), with no readiness flag.`,
    root_cause:
      'Contact quality is there in practice but the in-game approach expands the zone under pressure — a translation/approach gap, not a mechanical or fatigue problem.',
    causality_level: 'inferred_hypothesis',
    drivers: [driver(gap), driver(chase)],
    recommended_action:
      'Add game-pressure reps: live ABs with consequences, two-strike approach work, and a repeatable pre-pitch routine to carry the cage swing into games.',
    confidence_reason: `practice-to-game gap + elevated chase co-occur; composite confidence = weakest leg (${confidence.toFixed(2)})`,
  };

  return [
    {
      generator: 'composite_translation_gap',
      playerId: player.playerId,
      insightType: 'coachhelm_composite_translation_gap',
      title: "Cage-to-game gap (approach)",
      body: `Game avg ${points} pts under practice + elevated chase (${pct(chase.value)}). Add game-pressure reps.`,
      priority,
      confidence,
      playerVisible: playerVisibleFor(contributors.flatMap((m) => m.source_refs)),
      evidence: compositeEvidence(gap, contributors, diagnosis),
    },
  ];
}

// =============================================================================
// C. LIFT-TO-FIELD RISK COMPOSITE
//    elevated lift RPE / low readiness + a pitching workload flag
// =============================================================================

export function liftToFieldRiskComposite(
  player: LoadedPlayerMetrics,
): BaseballInsightCandidate[] {
  const rpe = player.metrics.lift_rpe_avg;
  const soreness = player.metrics.soreness_level;
  const energy = player.metrics.energy_level;
  const pitches = player.metrics.rolling_pitch_count;
  const innings = player.metrics.rolling_innings;

  const fatigueLeg =
    (rpe?.value != null && rpe.value >= getBaseballMetricThreshold('lift_rpe_avg') && rpe) ||
    (soreness?.value != null && soreness.value >= getBaseballMetricThreshold('soreness_level') && soreness) ||
    (energy?.value != null && energy.value <= getBaseballMetricThreshold('energy_level') && energy) ||
    null;
  const workloadLeg =
    (pitches?.value != null && pitches.value > getBaseballMetricThreshold('rolling_pitch_count') && pitches) ||
    (innings?.value != null && innings.value > getBaseballMetricThreshold('rolling_innings') && innings) ||
    null;

  if (!fatigueLeg || !workloadLeg) return [];

  const contributors: LoadedMetric[] = [workloadLeg, fatigueLeg];
  const confidence = weakestConfidence(contributors);
  const priority = clampThinSample(gate('high', confidence), workloadLeg.metric, workloadLeg.sample_n);

  const fatigueDesc =
    fatigueLeg.metric === 'lift_rpe_avg'
      ? `lift RPE ${r2(fatigueLeg.value!)}`
      : fatigueLeg.metric === 'soreness_level'
        ? `soreness ${fatigueLeg.value}/5`
        : `low energy ${fatigueLeg.value}/5`;
  const workDesc =
    workloadLeg.metric === 'rolling_pitch_count'
      ? `${Math.round(workloadLeg.value!)} pitches/7d`
      : `${r2(workloadLeg.value!)} innings/7d`;

  const diagnosis: Diagnosis = {
    symptom: `${fatigueDesc} stacked on a throwing workload flag (${workDesc}).`,
    root_cause:
      'Heavy strength load or low readiness next to a high throwing workload raises soft-tissue / overuse risk. Operational risk flag from co-occurring markers — not a medical assessment.',
    causality_level: 'inferred_hypothesis',
    drivers: [driver(workloadLeg), driver(fatigueLeg)],
    recommended_action:
      'Strength + pitching staff: do NOT stack a heavy lower-body lift on a high-intent throwing day this week. Sequence load with rest; any restriction requires staff approval.',
    confidence_reason: `workload + fatigue marker co-occur; composite confidence = weakest leg (${confidence.toFixed(2)})`,
  };

  return [
    {
      generator: 'composite_lift_to_field_risk',
      playerId: player.playerId,
      insightType: 'coachhelm_composite_lift_to_field_risk',
      title: 'Lift-to-field load risk',
      body: `${fatigueDesc} + ${workDesc}. Sequence lift/throwing load — staff visibility flag.`,
      priority,
      confidence,
      playerVisible: false, // staff-only load decision
      evidence: compositeEvidence(workloadLeg, contributors, diagnosis),
    },
  ];
}

// =============================================================================
// Run all composites for one player.
// =============================================================================

export function runBaseballComposites(player: LoadedPlayerMetrics): BaseballInsightCandidate[] {
  return [
    ...pitcherCommandDecayComposite(player),
    ...hitterTranslationGapComposite(player),
    ...liftToFieldRiskComposite(player),
  ];
}




