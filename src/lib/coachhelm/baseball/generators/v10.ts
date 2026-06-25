/**
 * CoachHelm BASEBALL V10 generator families.
 *
 * The W10 skeleton shipped 5 box-score generators (hitter chase, game-vs-
 * practice, velo/command, workload, schedule). V10 (docs/.../25_premium_ui_
 * coachhelm_v10 §"Generator Families" + 20_..._v6 §"Pattern Generators") deepens
 * the engine across the readiness/strength/practice/operations domains the lite
 * tables now support:
 *
 *   6. readinessGenerator        — soreness/energy/sleep/arm-status (operational)
 *   7. liftComplianceGenerator   — lift completion compliance + RPE spike
 *   8. practiceEffectivenessGenerator — did a focus block move its metric?
 *   9. importQualityGenerator    — warning/error rate on a recent import run
 *  10. videoEvidenceGenerator    — diagnostic signals lacking video evidence
 *
 * EVERY generator obeys the same contract as the box-score five:
 *   - direction + threshold + min_sample resolved from the REGISTRY (never
 *     hand-coded sense); workload/readiness metrics are neutral_threshold so
 *     attribution can never "learn backward" on them;
 *   - confidence taken VERBATIM from the loader (fidelity-capped, roster-
 *     recalibrated) — generators never re-invent confidence;
 *   - priority through BOTH the shared confidence gate AND the registry thin-
 *     sample clamp before any 'high' can ship;
 *   - structured, sourced Diagnosis with an HONEST causality_level (single-metric
 *     box-score / self-report signals are inferred_hypothesis; deterministic
 *     counts like import warnings + lift compliance are observed_sequence);
 *   - readiness/wellness NEVER use medical language and ALWAYS carry the
 *     "operational flag, not a medical assessment" caveat (V10 boundary).
 *
 * Pure functions. The action persists; no DB, no side effects.
 */

import type { Diagnosis, DiagnosisDriver, InsightPriority } from '@/lib/coachhelm/shared/evidence-types';
import { buildConfidenceReason } from '@/lib/coachhelm/shared/base-generator';
import type {
  BaseballInsightSourceRef,
} from '@/lib/types/baseball-coachhelm';
import {
  getBaseballMetricThreshold,
  getBaseballMetricLabel,
} from '../metrics/registry';
import type { LoadedMetric, LoadedPlayerMetrics } from '../loaders';
import type {
  ImportRunSummary,
  PracticeEffectivenessInput,
} from '../loaders-v10';
import {
  type BaseballInsightCandidate,
  driver,
  buildEvidence,
  playerVisibleFor,
  gate,
  clampThinSample,
  pct,
  r2,
} from './index';

// =============================================================================
// 6. READINESS (operational — NEVER medical)
//    Flags a player whose recent self-reported soreness/arm-status is high OR
//    whose energy/sleep is low. This is an OPERATIONAL availability flag for a
//    coach to review with the player — it is NOT a diagnosis. causality_level is
//    inferred_hypothesis (a self-report is not an observed athletic sequence).
// =============================================================================

const READINESS_CAVEAT = 'This is an operational readiness flag, not a medical assessment. Review with the player; any restriction requires staff approval.';

export function readinessGenerator(player: LoadedPlayerMetrics): BaseballInsightCandidate[] {
  const out: BaseballInsightCandidate[] = [];

  // Collect every breached readiness metric; emit ONE consolidated flag using
  // the worst as primary so a player doesn't get 4 separate readiness cards.
  type Hit = { m: LoadedMetric; reason: string };
  const hits: Hit[] = [];

  const soreness = player.metrics.soreness_level;
  if (soreness?.value != null && soreness.value >= getBaseballMetricThreshold('soreness_level')) {
    hits.push({ m: soreness, reason: `soreness ${soreness.value}/5` });
  }
  const arm = player.metrics.arm_status_level;
  if (arm?.value != null && arm.value >= getBaseballMetricThreshold('arm_status_level')) {
    hits.push({ m: arm, reason: `arm status escalated (${arm.value}/4)` });
  }
  const energy = player.metrics.energy_level;
  if (energy?.value != null && energy.value <= getBaseballMetricThreshold('energy_level')) {
    hits.push({ m: energy, reason: `energy ${energy.value}/5` });
  }
  const sleep = player.metrics.sleep_hours;
  if (sleep?.value != null && sleep.value <= getBaseballMetricThreshold('sleep_hours')) {
    hits.push({ m: sleep, reason: `${r2(sleep.value)}h sleep` });
  }
  if (hits.length === 0) return out;

  // Primary = arm-status if present (highest stakes for a thrower), else soreness.
  const primary = hits.find((h) => h.m.metric === 'arm_status_level')?.m ?? hits[0]!.m;
  const confidence = primary.confidence;

  // Severity: arm pain (4) or soreness 5 → high; otherwise medium. Gated by
  // confidence + thin-sample, so a single check-in stays at most low/medium.
  const severe =
    (arm?.value != null && arm.value >= 4) || (soreness?.value != null && soreness.value >= 5);
  const rawPriority: InsightPriority = severe ? 'high' : 'medium';
  const priority = clampThinSample(gate(rawPriority, confidence), primary.metric, primary.sample_n);

  const drivers: DiagnosisDriver[] = hits.map((h) => driver(h.m));
  const extraRefs: BaseballInsightSourceRef[] = hits
    .filter((h) => h.m !== primary)
    .flatMap((h) => h.m.source_refs);

  const diagnosis: Diagnosis = {
    symptom: `Recent readiness check-ins show ${hits.map((h) => h.reason).join(', ')}.`,
    root_cause:
      'Self-reported readiness is below the operational threshold. Possible accumulated fatigue or an emerging limitation — to be confirmed by staff, not assumed.',
    causality_level: 'inferred_hypothesis',
    drivers,
    recommended_action: `Check in with the player before the next throwing/lift session and adjust load if warranted. ${READINESS_CAVEAT}`,
    confidence_reason: buildConfidenceReason({ sample_n: primary.sample_n, confidence_factors: primary.confidence_factors }),
  };

  out.push({
    generator: 'readiness',
    playerId: player.playerId,
    insightType: 'coachhelm_readiness',
    title: 'Readiness flag',
    body: `Readiness below threshold (${hits.map((h) => h.reason).join(', ')}). Operational flag — review before next session.`,
    priority,
    confidence,
    // Readiness rests on staff_only check-ins → coach-only by the strictest rule,
    // AND every readiness metric (soreness/energy/sleep/arm) is registry
    // player_eligible:false (operational coach-judgment flag, never a player metric),
    // so the floor enforces coach-only even if a check-in source were ever widened.
    playerVisible: playerVisibleFor([...primary.source_refs, ...extraRefs], primary.metric),
    evidence: buildEvidence(primary, diagnosis, 'inferred_hypothesis', extraRefs),
  });
  return out;
}

// =============================================================================
// 7. LIFT COMPLIANCE + RPE SPIKE (performance)
//    a) compliance below the registry floor → a strength-staff follow-up.
//    b) rolling RPE above the ceiling → fatigue/over-reach watch.
//    Compliance is a deterministic count → observed_sequence; RPE is a
//    self-report → inferred_hypothesis.
// =============================================================================

export function liftComplianceGenerator(player: LoadedPlayerMetrics): BaseballInsightCandidate[] {
  const out: BaseballInsightCandidate[] = [];

  const comp = player.metrics.lift_completion_rate;
  if (comp?.value != null && comp.value <= getBaseballMetricThreshold('lift_completion_rate')) {
    const confidence = comp.confidence;
    const rawPriority: InsightPriority = comp.value <= 0.4 ? 'high' : 'medium';
    const priority = clampThinSample(gate(rawPriority, confidence), comp.metric, comp.sample_n);
    const diagnosis: Diagnosis = {
      symptom: `Only ${pct(comp.value)} of due lift assignments are completed across ${comp.sample_n} assignments.`,
      root_cause:
        'Strength work is not being completed as assigned — a compliance gap that, left alone, undercuts on-field development and readiness.',
      causality_level: 'observed_sequence',
      drivers: [driver(comp)],
      recommended_action:
        'Strength staff: confirm the assignments are realistic and reachable, then follow up with the player on the missed sessions.',
      confidence_reason: buildConfidenceReason({ sample_n: comp.sample_n, confidence_factors: comp.confidence_factors }),
    };
    out.push({
      generator: 'lift_compliance',
      playerId: player.playerId,
      insightType: 'coachhelm_lift_compliance',
      title: 'Lift compliance gap',
      body: `${pct(comp.value)} of due lifts completed. Strength-staff follow-up needed.`,
      priority,
      confidence,
      // lift_completion_rate is registry player_eligible:true — a player's own
      // accountability metric — so the floor lets it through when sources permit.
      playerVisible: playerVisibleFor(comp.source_refs, comp.metric),
      evidence: buildEvidence(comp, diagnosis, 'observed_sequence'),
    });
  }

  const rpe = player.metrics.lift_rpe_avg;
  if (rpe?.value != null && rpe.value >= getBaseballMetricThreshold('lift_rpe_avg')) {
    const confidence = rpe.confidence;
    const rawPriority: InsightPriority = rpe.value >= 9.2 ? 'high' : 'medium';
    const priority = clampThinSample(gate(rawPriority, confidence), rpe.metric, rpe.sample_n);
    const diagnosis: Diagnosis = {
      symptom: `Average lift RPE of ${r2(rpe.value)} over the last 14 days — above the over-reach watch line.`,
      root_cause:
        'Sustained high perceived exertion can signal accumulating fatigue. Self-reported — treat as a load-management watch, not a diagnosis.',
      causality_level: 'inferred_hypothesis',
      drivers: [driver(rpe)],
      recommended_action: `Review recent lift loads with strength staff; consider a deload if RPE stays elevated. ${READINESS_CAVEAT}`,
      confidence_reason: buildConfidenceReason({ sample_n: rpe.sample_n, confidence_factors: rpe.confidence_factors }),
    };
    out.push({
      generator: 'lift_rpe_spike',
      playerId: player.playerId,
      insightType: 'coachhelm_lift_rpe',
      title: 'Lift RPE elevated',
      body: `Avg RPE ${r2(rpe.value)} (14d) — over-reach watch. Review load with strength staff.`,
      priority,
      confidence,
      // lift_rpe_avg is registry player_eligible:false — a fatigue/over-reach
      // judgment the strength staff interprets, not a raw player-facing number.
      playerVisible: playerVisibleFor(rpe.source_refs, rpe.metric),
      evidence: buildEvidence(rpe, diagnosis, 'inferred_hypothesis'),
    });
  }
  return out;
}

// =============================================================================
// 8. PRACTICE EFFECTIVENESS (operations / closing the loop)
//    Did a focus block actually move its metric? This is the V10 "practice
//    effectiveness" generator — the honesty boundary is strict: NEVER claim
//    causality from one practice; use "associated with / too early / no
//    detectable movement". A positive improvement-signed delta past threshold →
//    a CONTINUE recommendation; a negative one → ADJUST; thin after-sample →
//    "too early".
// =============================================================================

export function practiceEffectivenessGenerator(
  input: PracticeEffectivenessInput,
): BaseballInsightCandidate[] {
  if (input.beforeValue == null || input.afterValue == null) {
    // Not yet enough data on both sides → an explicit "too early" card so the
    // coach knows the loop is open, never a fabricated success.
    return [tooEarlyCard(input)];
  }

  // The movement metric is registered higher_better (positive = improved the
  // right way). The action computes the improvement-signed delta from the
  // registry direction of the FOCUS metric, so we read the already-signed value.
  const movement = input.afterValue - input.beforeValue;
  const metric = 'practice_focus_movement' as const;
  const label = getBaseballMetricLabel(input.focusMetric);

  // Confidence is governed by the AFTER sample — a 1-game after window is thin.
  const afterThin = input.afterSampleN < 2;
  const confidence = afterThin ? 0.3 : Math.min(0.7, 0.4 + input.afterSampleN * 0.05);

  let verdict: 'continue' | 'adjust' | 'too_early';
  let priority: InsightPriority;
  if (afterThin) {
    verdict = 'too_early';
    priority = 'low';
  } else if (movement > 0) {
    verdict = 'continue';
    priority = clampThinSample(gate('medium', confidence), metric, input.afterSampleN);
  } else {
    verdict = 'adjust';
    priority = clampThinSample(gate('medium', confidence), metric, input.afterSampleN);
  }

  const drivers: DiagnosisDriver[] = [
    {
      metric: input.focusMetric,
      value: input.afterValue,
      unit: 'ratio',
      sample_n: input.afterSampleN,
      source: `baseball_practices "${input.practiceTitle}" → after window`,
    },
  ];

  const symptom =
    verdict === 'too_early'
      ? `"${input.practiceTitle}" targeted ${label}, but the after-practice window (${input.afterSampleN} session${input.afterSampleN === 1 ? '' : 's'}) is too small to judge movement yet.`
      : movement > 0
        ? `${label} moved the right way (${r2(Math.abs(movement))}) after "${input.practiceTitle}".`
        : `${label} has not improved (${r2(movement)}) after "${input.practiceTitle}".`;

  const action =
    verdict === 'too_early'
      ? 'Keep the focus block in rotation and re-evaluate after the next 2-3 sessions.'
      : verdict === 'continue'
        ? 'Movement is associated with this focus block — continue it and schedule the next follow-up to confirm the trend.'
        : 'No detectable movement yet — adjust the drill or station before continuing, and re-measure.';

  const diagnosis: Diagnosis = {
    symptom,
    root_cause:
      'Practice-effectiveness is an association, not proof. One practice cannot establish causality; this verdict is based on the before/after window only.',
    causality_level: 'inferred_hypothesis',
    drivers,
    recommended_action: action,
    confidence_reason:
      verdict === 'too_early'
        ? `after-window n=${input.afterSampleN} below the 2-session minimum to judge`
        : `before/after compared over ${input.afterSampleN} after-sessions; association only`,
  };

  const refs: BaseballInsightSourceRef[] = [
    { table: 'baseball_practices', column: 'focus', visibility: 'team', sample_n: input.afterSampleN, label: `Focus: ${label}`, confidence },
    { table: 'baseball_player_stats', column: 'before/after focus metric', visibility: 'staff_only', sample_n: input.afterSampleN, label: 'Before/after measurement', confidence },
  ];

  return [
    {
      generator: 'practice_effectiveness',
      playerId: null, // cohort-level (the block's attendees)
      insightType: 'coachhelm_practice_effectiveness',
      title:
        verdict === 'continue'
          ? 'Practice working — continue'
          : verdict === 'adjust'
            ? 'Practice not moving the needle'
            : 'Practice effect — too early',
      body: symptom,
      priority,
      confidence,
      playerVisible: false, // staff effectiveness review
      evidence: {
        sample_n: input.afterSampleN,
        target_n: 2,
        confidence_factors: { sample_adequacy: Math.min(1, input.afterSampleN / 2), recency: 1, variance: 0, factors_measured: false },
        diagnosis,
        causality_level: 'inferred_hypothesis',
        source_refs: refs,
      },
    },
  ];
}

function tooEarlyCard(input: PracticeEffectivenessInput): BaseballInsightCandidate {
  const label = getBaseballMetricLabel(input.focusMetric);
  const refs: BaseballInsightSourceRef[] = [
    { table: 'baseball_practices', column: 'focus', visibility: 'team', sample_n: 1, label: `Focus: ${label}`, confidence: 0.3 },
  ];
  return {
    generator: 'practice_effectiveness',
    playerId: null,
    insightType: 'coachhelm_practice_effectiveness',
    title: 'Practice effect — too early',
    body: `"${input.practiceTitle}" targeted ${label}; not enough before/after data to judge movement yet.`,
    priority: 'low',
    confidence: 0.3,
    playerVisible: false,
    evidence: {
      sample_n: 0,
      target_n: 2,
      confidence_factors: { sample_adequacy: 0, recency: 1, variance: 0, factors_measured: false },
      diagnosis: {
        symptom: `Insufficient before/after data for "${input.practiceTitle}".`,
        root_cause: 'The follow-up window has not produced enough measurements to associate movement with the focus block.',
        causality_level: 'inferred_hypothesis',
        drivers: [],
        recommended_action: 'Keep measuring after the focus block; re-evaluate once the after-window has at least 2 sessions.',
        confidence_reason: 'no after-window measurements yet',
      },
      causality_level: 'inferred_hypothesis',
      source_refs: refs,
    },
  };
}

// =============================================================================
// 9. IMPORT QUALITY (operations)
//    A recent import run with a high warning/error rate (or a failed status)
//    should block trust in the stats it produced. Deterministic counts →
//    observed_sequence; confidence is high (we counted the warnings, we did not
//    infer them).
// =============================================================================

export function importQualityGenerator(runs: ImportRunSummary[]): BaseballInsightCandidate[] {
  const out: BaseballInsightCandidate[] = [];
  const threshold = getBaseballMetricThreshold('import_warning_rate');
  // Only look at recently-touched runs (last 14 days) so we don't re-flag old
  // history; the action passes a bounded set, but we guard here too.
  const cutoff = Date.now() - 14 * 86400_000;
  for (const run of runs) {
    if (run.created_at && Date.parse(run.created_at) < cutoff) continue;
    const total = Math.max(1, run.row_count);
    const warnRate = (run.warning_count + run.error_count) / total;
    const failed = run.status === 'failed';
    if (!failed && warnRate < threshold) continue;

    const confidence = 1; // a counted rate is not an inference
    const rawPriority: InsightPriority = failed || run.error_count > 0 || warnRate >= 0.4 ? 'high' : 'medium';
    // import_warning_rate has min_sample 1, so the clamp is a no-op; gate is also
    // a no-op at confidence 1 — but route through both for uniformity.
    const priority = clampThinSample(gate(rawPriority, confidence), 'import_warning_rate', total);

    const diagnosis: Diagnosis = {
      symptom: failed
        ? `Import "${run.source_label}" (${run.import_type}) FAILED.`
        : `Import "${run.source_label}" (${run.import_type}) carried ${run.warning_count} warnings + ${run.error_count} errors across ${run.row_count} rows (${pct(warnRate)}).`,
      root_cause:
        'The imported stats may be incomplete or wrong. Acting on signals derived from this run risks coaching off bad data.',
      causality_level: 'observed_sequence',
      drivers: [
        { metric: 'import_warning_rate', value: warnRate, unit: 'percent', sample_n: total, source: `baseball_import_runs ${run.id}` },
      ],
      recommended_action: failed
        ? 'Re-run or fix the import before trusting any stats it would have produced.'
        : 'Review the flagged rows in the Import Center before relying on this run; correct + re-commit if needed.',
      confidence_reason: `${run.warning_count + run.error_count} flagged of ${run.row_count} rows; counted, not inferred`,
    };

    out.push({
      generator: 'import_quality',
      playerId: null,
      insightType: 'coachhelm_import_quality',
      title: failed ? 'Import failed' : 'Import data-quality warning',
      body: diagnosis.symptom,
      priority,
      confidence,
      playerVisible: false, // import internals are staff-only
      evidence: {
        sample_n: total,
        target_n: 1,
        confidence_factors: { sample_adequacy: 1, recency: 1, variance: 1, factors_measured: true },
        diagnosis,
        causality_level: 'observed_sequence',
        source_refs: [
          { table: 'baseball_import_runs', column: 'warning_count,error_count,status', visibility: 'staff_only', sample_n: total, label: 'Import run summary', confidence: 1 },
        ],
      },
    });
  }
  return out;
}

// =============================================================================
// 10. VIDEO EVIDENCE COVERAGE (operations)
//     When active diagnostic signals lack any linked video clip, surface a
//     coverage gap so the staff can attach evidence. This is a meta-signal about
//     the engine's own output, deterministic → observed_sequence.
// =============================================================================

export interface VideoCoverageInput {
  /** Active diagnostic insights that COULD carry a clip (player-scoped). */
  diagnosticCount: number;
  /** How many of those have at least one linked video event. */
  withVideoCount: number;
}

export function videoEvidenceGenerator(input: VideoCoverageInput): BaseballInsightCandidate[] {
  if (input.diagnosticCount < 3) return []; // not worth flagging on a tiny set
  const coverage = input.diagnosticCount > 0 ? input.withVideoCount / input.diagnosticCount : 1;
  const threshold = getBaseballMetricThreshold('video_evidence_coverage');
  if (coverage > threshold) return [];

  const confidence = 0.49; // proxy metric → capped under the high bar (medium max)
  const priority = clampThinSample(gate('medium', confidence), 'video_evidence_coverage', input.diagnosticCount);
  const missing = input.diagnosticCount - input.withVideoCount;

  const diagnosis: Diagnosis = {
    symptom: `${missing} of ${input.diagnosticCount} active diagnostic signals have no linked video evidence (${pct(coverage)} coverage).`,
    root_cause:
      'Signals without video are harder for staff + players to trust and act on. This is a coverage gap, not a claim about the signals themselves.',
    causality_level: 'observed_sequence',
    drivers: [
      { metric: 'video_evidence_coverage', value: coverage, unit: 'percent', sample_n: input.diagnosticCount, source: 'active insights vs linked video events' },
    ],
    recommended_action: 'Attach clips to the highest-priority signals first so player-facing actions ship with evidence.',
    confidence_reason: `${input.withVideoCount}/${input.diagnosticCount} signals have clips; coverage proxy`,
  };

  return [
    {
      generator: 'video_evidence',
      playerId: null,
      insightType: 'coachhelm_video_evidence',
      title: 'Video evidence gap',
      body: `${missing} active signals have no video (${pct(coverage)} coverage). Attach clips to the top signals.`,
      priority,
      confidence,
      playerVisible: false,
      evidence: {
        sample_n: input.diagnosticCount,
        target_n: 1,
        confidence_factors: { sample_adequacy: 1, recency: 1, variance: 0, factors_measured: false },
        diagnosis,
        causality_level: 'observed_sequence',
        source_refs: [
          { table: 'baseball_coach_insights', column: 'metadata.video_links', visibility: 'staff_only', sample_n: input.diagnosticCount, label: 'Video coverage of active signals', confidence },
        ],
      },
    },
  ];
}

// =============================================================================
// V10 generator ids + insight types (extends the W10 skeleton set).
// =============================================================================

export const BASEBALL_V10_GENERATOR_IDS = [
  'readiness',
  'lift_compliance',
  'lift_rpe_spike',
  'practice_effectiveness',
  'import_quality',
  'video_evidence',
] as const;

export const BASEBALL_V10_INSIGHT_TYPES = [
  'coachhelm_readiness',
  'coachhelm_lift_compliance',
  'coachhelm_lift_rpe',
  'coachhelm_practice_effectiveness',
  'coachhelm_import_quality',
  'coachhelm_video_evidence',
] as const;
