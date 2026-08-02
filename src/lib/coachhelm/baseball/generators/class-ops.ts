/**
 * CoachHelm BASEBALL CLASS / OPERATIONS generator family (V6 §Class/operations).
 *
 * The V6 spec lists 6 class/operations generators; the build shipped ZERO of
 * them (only the unrelated schedule-overlap generator existed). This module adds
 * the operationally-actionable ones that current data supports:
 *
 *   - classConflictGenerator        — a player's class/availability conflict
 *     overlaps a scheduled MANDATORY practice block (V6 "class conflict
 *     affecting practice block"; V10 metric class_conflict_count).
 *   - missingAcknowledgementGenerator — a player has a high share of assigned
 *     actions/tasks they have NOT acknowledged (V6 "missing acknowledgement
 *     risk").
 *   - staleSourceDataGenerator      — a player's profile/roster/source data has
 *     not refreshed within the staleness window (V6 "stale roster/profile/source
 *     data").
 *   - tasksUnseenGenerator          — a player has assigned items they have not
 *     VIEWED at all (V6 "player not seeing assigned tasks/videos").
 *
 * CONTRACT — identical to generators/index.ts + v10.ts:
 *   - direction + threshold from the REGISTRY (class_conflict_count is
 *     neutral_threshold — a count against a ceiling; stale_source_days too);
 *   - confidence taken VERBATIM from the loader-built LoadedMetric;
 *   - priority through gate + clampThinSample;
 *   - deterministic counts (conflicts, ack/seen shares, staleness) are
 *     observed_sequence — these are RECORDED facts, not inferences about cause.
 *
 * These are OPERATIONS signals (staff-facing): they help a coach keep the program
 * running, not diagnose athletic performance. None use medical or athletic-
 * outcome language. Pure functions; the action assembles the typed inputs.
 */

import type { Diagnosis, InsightPriority } from '@/lib/coachhelm/shared/evidence-types';
import type { BaseballInsightSourceRef } from '@/lib/types/baseball-coachhelm';
import { getBaseballMetricThreshold } from '../metrics/registry';
import type { LoadedMetric } from '../loaders';
import {
  type BaseballInsightCandidate,
  driver,
  buildEvidence,
  gate,
  clampThinSample,
  pct,
} from './index';

// -----------------------------------------------------------------------------
// Typed inputs the action assembles (mirrors PracticeEffectivenessInput etc.).
// -----------------------------------------------------------------------------

/** A class/availability conflict overlapping a scheduled practice block. */
export interface ClassConflictInput {
  playerId: string;
  /** The practice block (or mandatory event) the conflict overlaps. */
  practiceTitle: string;
  /** Overlapping class/conflict label, e.g. "BIO 201 lab". */
  conflictLabel: string;
  /** How many such overlaps exist for this player in the lookahead window. */
  conflictCount: number;
  /** Minutes of the most significant overlap (for the diagnosis driver). */
  overlapMinutes: number;
}

/** One player's acknowledgement / view coverage of assigned actions. */
export interface AcknowledgementInput {
  playerId: string;
  /** Assigned actions/tasks/videos due to the player. */
  assignedCount: number;
  /** How many the player has ACKNOWLEDGED. */
  acknowledgedCount: number;
  /** How many the player has at least VIEWED (≥ acknowledgedCount). */
  seenCount: number;
}

/** One player's data-staleness snapshot. */
export interface StaleSourceInput {
  playerId: string;
  /** Days since the player's profile/roster/source data last refreshed. */
  daysSinceRefresh: number;
  /** What is stale, e.g. "profile + last stat import". */
  staleLabel: string;
}

// -----------------------------------------------------------------------------
// Local LoadedMetric builders — these generators read assembled counts, not
// box-score rows, so we construct an honest LoadedMetric inline (confidence from
// sample adequacy, never fabricated; the action could equally pass loader output,
// but these operational counts are simple enough to build here honestly).
// -----------------------------------------------------------------------------

function opsMetric(
  metric: LoadedMetric['metric'],
  value: number,
  sampleN: number,
  targetN: number,
  refs: BaseballInsightSourceRef[],
): LoadedMetric {
  // Deterministic operational counts: confidence is sample-adequacy only and is
  // honestly high when the denominator is real. No fabricated variance floor.
  const sampleAdequacy = targetN > 0 ? Math.min(1, sampleN / targetN) : 0;
  const confidence = Math.max(0, Math.min(1, sampleAdequacy));
  return {
    metric,
    value,
    unit: 'count',
    sample_n: sampleN,
    target_n: targetN,
    confidence,
    confidence_factors: { sample_adequacy: sampleAdequacy, recency: 1, variance: 1, factors_measured: true },
    source_refs: refs.map((r) => ({ ...r, confidence })),
  };
}

// =============================================================================
// 1. CLASS CONFLICT vs PRACTICE BLOCK (academics / availability)
//    A player's class/availability conflict overlaps a scheduled practice block.
//    Deterministic overlap → observed_sequence. class_conflict_count is
//    neutral_threshold (a count monitored against a ceiling).
// =============================================================================

export function classConflictGenerator(input: ClassConflictInput): BaseballInsightCandidate[] {
  if (input.conflictCount < getBaseballMetricThreshold('class_conflict_count')) return [];

  const refs: BaseballInsightSourceRef[] = [
    { table: 'baseball_class_sessions', column: 'start_time,end_time', visibility: 'staff_only', sample_n: input.conflictCount, label: `Class: ${input.conflictLabel}`, confidence: 1 },
    { table: 'baseball_availability_conflicts', column: 'overlap', visibility: 'staff_only', sample_n: input.conflictCount, label: 'Practice-block overlap', confidence: 1 },
  ];
  const m = opsMetric('class_conflict_count', input.conflictCount, input.conflictCount, 1, refs);
  // A count-vs-ceiling: 2+ overlaps is high, 1 is medium. Gated + clamped (no-op
  // at min_sample 1 / confidence 1, but routed for uniformity).
  const rawPriority: InsightPriority = input.conflictCount >= 2 ? 'high' : 'medium';
  const priority = clampThinSample(gate(rawPriority, m.confidence), 'class_conflict_count', m.sample_n);

  const diagnosis: Diagnosis = {
    symptom: `"${input.conflictLabel}" overlaps the "${input.practiceTitle}" block by ${input.overlapMinutes} minutes (${input.conflictCount} conflict${input.conflictCount === 1 ? '' : 's'} in the window).`,
    root_cause: 'A class/academic commitment collides with a scheduled practice block — the player cannot attend both.',
    causality_level: 'observed_sequence',
    drivers: [driver(m)],
    recommended_action: 'Adjust the player’s practice block, offer a make-up window, or relax the mandatory flag so the academic conflict does not force a missed commitment.',
    confidence_reason: `${input.conflictCount} recorded class/practice overlap${input.conflictCount === 1 ? '' : 's'}; deterministic check`,
  };

  return [
    {
      generator: 'class_conflict',
      playerId: input.playerId,
      insightType: 'coachhelm_class_conflict',
      title: 'Class conflicts with practice',
      body: `"${input.conflictLabel}" overlaps "${input.practiceTitle}" (${input.overlapMinutes} min). Adjust the block or offer a make-up.`,
      priority,
      confidence: m.confidence,
      // Class schedule + the practice block are both player-relevant; but the
      // availability conflict is a staff coordination item → coach-facing.
      playerVisible: false,
      evidence: buildEvidence(m, diagnosis, 'observed_sequence'),
    },
  ];
}

// =============================================================================
// 2. MISSING ACKNOWLEDGEMENT (operations)
//    A high share of assigned actions the player has not acknowledged.
//    Deterministic share → observed_sequence.
// =============================================================================

export function missingAcknowledgementGenerator(input: AcknowledgementInput): BaseballInsightCandidate[] {
  if (input.assignedCount <= 0) return [];
  const rate = 1 - input.acknowledgedCount / input.assignedCount;
  if (rate < getBaseballMetricThreshold('missing_acknowledgement_rate')) return [];

  const refs: BaseballInsightSourceRef[] = [
    { table: 'baseball_timeline_event_acks', column: 'acknowledged_at', visibility: 'staff_only', sample_n: input.assignedCount, label: 'Acknowledgement coverage', confidence: 1 },
  ];
  const m = opsMetric('missing_acknowledgement_rate', rate, input.assignedCount, 3, refs);
  const rawPriority: InsightPriority = rate >= 0.7 ? 'high' : 'medium';
  const priority = clampThinSample(gate(rawPriority, m.confidence), 'missing_acknowledgement_rate', m.sample_n);
  const missing = input.assignedCount - input.acknowledgedCount;

  const diagnosis: Diagnosis = {
    symptom: `${missing} of ${input.assignedCount} assigned actions are unacknowledged (${pct(rate)} unacknowledged).`,
    root_cause: 'Assigned coaching actions are not being acknowledged — they may not be getting read or actioned, so development items are stalling.',
    causality_level: 'observed_sequence',
    drivers: [driver(m)],
    recommended_action: 'Follow up with the player on the unacknowledged items; if a pattern, simplify or reduce the assignment load so the important items land.',
    confidence_reason: `${input.acknowledgedCount}/${input.assignedCount} acknowledged; counted, not inferred`,
  };

  return [
    {
      generator: 'missing_acknowledgement',
      playerId: input.playerId,
      insightType: 'coachhelm_missing_acknowledgement',
      title: 'Assigned actions unacknowledged',
      body: `${missing} of ${input.assignedCount} actions unacknowledged. Follow up so development items don’t stall.`,
      priority,
      confidence: m.confidence,
      playerVisible: false,
      evidence: buildEvidence(m, diagnosis, 'observed_sequence'),
    },
  ];
}

// =============================================================================
// 3. STALE SOURCE DATA (operations)
//    A player's profile/roster/source data has not refreshed within the window.
//    Deterministic clock → observed_sequence. stale_source_days is
//    neutral_threshold (a staleness clock, not an athletic outcome).
// =============================================================================

export function staleSourceDataGenerator(input: StaleSourceInput): BaseballInsightCandidate[] {
  if (input.daysSinceRefresh < getBaseballMetricThreshold('stale_source_days')) return [];

  const refs: BaseballInsightSourceRef[] = [
    { table: 'baseball_player_development_metrics', column: 'computed_at', visibility: 'staff_only', sample_n: 1, label: `Stale: ${input.staleLabel}`, confidence: 1 },
  ];
  const m = opsMetric('stale_source_days', input.daysSinceRefresh, 1, 1, refs);
  const rawPriority: InsightPriority = input.daysSinceRefresh >= 45 ? 'high' : 'medium';
  const priority = clampThinSample(gate(rawPriority, m.confidence), 'stale_source_days', m.sample_n);

  const diagnosis: Diagnosis = {
    symptom: `${input.staleLabel} has not refreshed in ${input.daysSinceRefresh} days.`,
    root_cause: 'Stale source data means CoachHelm signals for this player rest on out-of-date inputs — acting on them risks coaching off an old picture.',
    causality_level: 'observed_sequence',
    drivers: [driver(m)],
    recommended_action: 'Refresh the player’s data (import recent stats / update the profile) before relying on signals derived for this player.',
    confidence_reason: `${input.daysSinceRefresh} days since last refresh; clock, not inference`,
  };

  return [
    {
      generator: 'stale_source_data',
      playerId: input.playerId,
      insightType: 'coachhelm_stale_source_data',
      title: 'Player data is stale',
      body: `${input.staleLabel} is ${input.daysSinceRefresh} days old. Refresh before trusting this player’s signals.`,
      priority,
      confidence: m.confidence,
      playerVisible: false,
      evidence: buildEvidence(m, diagnosis, 'observed_sequence'),
    },
  ];
}

// =============================================================================
// 4. TASKS UNSEEN (operations) — "player not seeing assigned tasks/videos"
//    Distinct from unacknowledged: the player has not even VIEWED the items.
//    Deterministic share → observed_sequence.
// =============================================================================

export function tasksUnseenGenerator(input: AcknowledgementInput): BaseballInsightCandidate[] {
  if (input.assignedCount <= 0) return [];
  const rate = 1 - input.seenCount / input.assignedCount;
  if (rate < getBaseballMetricThreshold('tasks_unseen_rate')) return [];

  const refs: BaseballInsightSourceRef[] = [
    { table: 'baseball_timeline_event_acks', column: 'viewed', visibility: 'staff_only', sample_n: input.assignedCount, label: 'View coverage of assigned items', confidence: 1 },
  ];
  const m = opsMetric('tasks_unseen_rate', rate, input.assignedCount, 3, refs);
  const rawPriority: InsightPriority = rate >= 0.8 ? 'high' : 'medium';
  const priority = clampThinSample(gate(rawPriority, m.confidence), 'tasks_unseen_rate', m.sample_n);
  const unseen = input.assignedCount - input.seenCount;

  const diagnosis: Diagnosis = {
    symptom: `${unseen} of ${input.assignedCount} assigned items have not been opened by the player (${pct(rate)} unseen).`,
    root_cause: 'Assigned tasks/videos are not being seen at all — a delivery/visibility gap, not (yet) a buy-in gap. The player may not know they exist.',
    causality_level: 'observed_sequence',
    drivers: [driver(m)],
    recommended_action: 'Confirm the player has app access + notifications on; nudge them to open assigned items, and verify nothing is mis-targeted (wrong visibility).',
    confidence_reason: `${input.seenCount}/${input.assignedCount} opened; counted, not inferred`,
  };

  return [
    {
      generator: 'tasks_unseen',
      playerId: input.playerId,
      insightType: 'coachhelm_tasks_unseen',
      title: 'Player not seeing assigned items',
      body: `${unseen} of ${input.assignedCount} items unopened. Check access/notifications and that nothing is mis-targeted.`,
      priority,
      confidence: m.confidence,
      playerVisible: false,
      evidence: buildEvidence(m, diagnosis, 'observed_sequence'),
    },
  ];
}

// =============================================================================
// Inputs bundle + ids/types.
// =============================================================================

export interface ClassOpsInputs {
  classConflicts?: ClassConflictInput[];
  acknowledgement?: AcknowledgementInput[];
  staleSources?: StaleSourceInput[];
}

/** Run every class/operations generator over the assembled inputs. */
export function runBaseballClassOpsGenerators(inputs: ClassOpsInputs): BaseballInsightCandidate[] {
  const out: BaseballInsightCandidate[] = [];
  for (const c of inputs.classConflicts ?? []) out.push(...classConflictGenerator(c));
  for (const a of inputs.acknowledgement ?? []) {
    out.push(...missingAcknowledgementGenerator(a));
    out.push(...tasksUnseenGenerator(a));
  }
  for (const s of inputs.staleSources ?? []) out.push(...staleSourceDataGenerator(s));
  return out;
}

export const BASEBALL_CLASS_OPS_INSIGHT_TYPES = [
  'coachhelm_class_conflict',
  'coachhelm_missing_acknowledgement',
  'coachhelm_stale_source_data',
  'coachhelm_tasks_unseen',
] as const;
