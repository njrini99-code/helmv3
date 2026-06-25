/**
 * CoachHelm BASEBALL — Practice Effectiveness Engine (pure measurement core).
 *
 * Controlling spec:
 *   docs/baseballhelm_revolution_plan_v2/22_deeper_workflows_research_v7/
 *     v7_coachhelm_practice_effectiveness_engine.md
 *
 * THE V7 CORE QUESTION
 *   "What did we practice, who practiced it, how well did they complete it, and
 *    did related game/scrimmage/practice metrics improve afterward?"
 *
 * This module answers ONLY the measurement half — connecting a practiced
 * objective (focus_area + target_metric + assigned players) to LATER statistical
 * movement — and it answers it HONESTLY. The action (practice-effectiveness.ts)
 * loads box-score rows + objectives and persists the result; this module has NO
 * DB access and NO side effects, so it is unit-testable and reusable.
 *
 * HONESTY IS THE WHOLE POINT (V7 "CoachHelm Honesty Rules"). This engine:
 *   - resolves "did it get better?" via the metric registry's improvement SIGN
 *     (baseballImprovementSign) — NEVER from a raw post−before delta. A velo drop
 *     is never an improvement; a chase-rate drop is.
 *   - NEVER emits a "high"/"proven" confidence. The strongest honest tier is
 *     'correlated_not_proven'. Single-window box-score transfer can NEVER prove
 *     causation, so causality is always association at best.
 *   - emits 'too_early' when the after-window is too soon, 'not_enough_sample'
 *     when before/after samples are thin, 'not_tracked' when the focus has no
 *     consistently-measured metric, and 'no_signal' when measured-but-flat.
 *   - records CONFOUNDERS (attendance gaps, scope mixing, opponent/context
 *     change, metric inconsistency) so a coach sees what else could explain it.
 *   - LABELS the after-scope (official_game / scrimmage / practice / mixed) so a
 *     mixed read is never presented as a single clean number (V7 hard rule).
 *
 * It feeds the Decision Room + Practice Intelligence; it is staff-only by default.
 */

import {
  baseballImprovementSign,
  getBaseballMetricDirection,
  getBaseballMetricFidelity,
  getBaseballMetricLabel,
  getBaseballMetricUnit,
  isBaseballMetricId,
} from '@/lib/coachhelm/baseball/metrics/registry';
import type { BaseballInsightSourceRef } from '@/lib/types/baseball-coachhelm';
import type {
  BaseballEffectivenessAfterScope,
  BaseballEffectivenessConfidenceTier,
  BaseballEffectivenessDirection,
  EffectivenessConfounder,
  EffectivenessRecommendedAction,
} from '@/lib/types/baseball-practice-effectiveness';

// -----------------------------------------------------------------------------
// Inputs
// -----------------------------------------------------------------------------

/** A scope label for a single box-score / session row used in measurement. */
export type MeasurementScope = 'official_game' | 'scrimmage' | 'practice';

/**
 * The minimal per-session value the engine measures. One row = one session's
 * value of the focus metric for ONE assigned player, plus its date and scope.
 * The action computes `value` from box-score columns via the loader's metric
 * math so the engine stays metric-agnostic.
 */
export interface MeasurementPoint {
  playerId: string;
  /** ISO date of the session. */
  date: string;
  /** The metric value on that session (already computed by the caller). */
  value: number;
  /** Where the value was measured — drives the after-scope label. */
  scope: MeasurementScope;
  /** Observations behind this single point (e.g. plate appearances). */
  weight?: number;
}

/** Whether each assigned player actually attended the practice (+ limited). */
export interface ObjectiveAttendance {
  playerId: string;
  attended: boolean;
  /** True when present-but-limited/sore — a real confounder, not an absence. */
  limited?: boolean;
}

/** Everything one effectiveness measurement needs. */
export interface EffectivenessMeasurementInput {
  teamId: string;
  practiceId: string;
  objectiveId: string | null;
  focusArea: string;
  /** Registry metric id the objective targets (or a free string / null). */
  targetMetric: string | null;
  /** Canonical player ids the objective was assigned to. */
  playerIds: string[];
  /** ISO date of the practice (the before/after pivot). */
  practiceDate: string;
  /** Points BEFORE the practice (any scope) — the baseline window. */
  before: MeasurementPoint[];
  /** Points AFTER the practice — the transfer window. */
  after: MeasurementPoint[];
  /** Attendance for the assigned players. */
  attendance: ObjectiveAttendance[];
  /** CoachHelm signal ids (baseball_coach_insights) this objective addresses. */
  linkedSignalIds?: string[];
  /** Today (injectable for tests). Defaults to now. */
  now?: Date;
}

// -----------------------------------------------------------------------------
// Calibration constants — recalibrated for 12-25 player rosters + box-score data.
// These are intentionally LOW vs golf round counts (a college season is a few
// dozen games), but honesty comes from confidence + tier, never from a value we
// don't have. See loaders.ts BASEBALL_TARGET_N for the parallel rationale.
// -----------------------------------------------------------------------------

/** Minimum sessions on EACH side before we even attempt a movement read. */
const MIN_SIDE_SAMPLE = 2;
/** Sessions on each side for a fully-adequate (still only "correlated") read. */
const TARGET_SIDE_SAMPLE = 4;
/**
 * Days after the practice before transfer is even readable. Inside this window a
 * measurement is 'too_early' regardless of how the number moved — you cannot
 * read transfer the same day you taught it.
 */
const MIN_DAYS_TO_READ_AFTER = 2;
/**
 * Relative movement (vs the before value, sign-corrected) under which we call it
 * 'stable'/'no_signal' rather than improved/worse. Box-score noise on small
 * samples easily produces 1-2% swings that mean nothing.
 */
const STABLE_REL_BAND = 0.05;
/**
 * The HARD confidence ceiling for ANY practice-effectiveness review. The engine
 * physically cannot emit a value that would read as "high" downstream — a single
 * practice's transfer into box scores is association, never proof.
 */
const CORRELATION_CONFIDENCE_CEILING = 0.45;

// -----------------------------------------------------------------------------
// Output
// -----------------------------------------------------------------------------

/** The full measurement result the action persists as one review row. */
export interface EffectivenessReview {
  teamId: string;
  practiceId: string;
  objectiveId: string | null;
  focusArea: string;
  /** Resolved registry metric id, or null when the focus has no tracked metric. */
  metricId: string | null;
  playerIds: string[];
  linkedSignalIds: string[];

  metricBefore: number | null;
  metricAfter: number | null;
  sampleBefore: number;
  sampleAfter: number;
  windowBeforeDays: number;
  windowAfterDays: number;

  direction: BaseballEffectivenessDirection;
  afterScope: BaseballEffectivenessAfterScope;
  confidence: number | null;
  confidenceTier: BaseballEffectivenessConfidenceTier;

  confounders: EffectivenessConfounder[];
  conclusion: string;
  recommendedNextAction: EffectivenessRecommendedAction;

  sourceRefs: BaseballInsightSourceRef[];
  /** Stable (team, practice, focus, metric) key for upsert dedupe. */
  dedupeKey: string;
  generatedBy: string;
}

export const PRACTICE_EFFECTIVENESS_ENGINE_ID = 'practice_effectiveness_v1';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function avgWeighted(points: MeasurementPoint[]): number | null {
  if (points.length === 0) return null;
  let num = 0;
  let den = 0;
  for (const p of points) {
    const w = p.weight && p.weight > 0 ? p.weight : 1;
    num += p.value * w;
    den += w;
  }
  return den > 0 ? num / den : null;
}

function spanDays(points: MeasurementPoint[]): number {
  const ts = points
    .map((p) => Date.parse(p.date))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
  if (ts.length < 2) return 0;
  return Math.round((ts[ts.length - 1]! - ts[0]!) / 86_400_000);
}

function resolveAfterScope(points: MeasurementPoint[]): BaseballEffectivenessAfterScope {
  if (points.length === 0) return 'unknown';
  const scopes = new Set(points.map((p) => p.scope));
  if (scopes.size > 1) return 'mixed';
  const only = [...scopes][0]!;
  return only; // 'official_game' | 'scrimmage' | 'practice'
}

function dedupeKeyFor(input: EffectivenessMeasurementInput, metricId: string | null): string {
  const focusSlug = input.focusArea.trim().toLowerCase().replace(/\s+/g, '_').slice(0, 40);
  return `pe:${input.practiceId}:${focusSlug}:${metricId ?? 'none'}`;
}

function scopeLabel(scope: BaseballEffectivenessAfterScope): string {
  switch (scope) {
    case 'official_game':
      return 'official games';
    case 'scrimmage':
      return 'scrimmages';
    case 'practice':
      return 'practice sessions';
    case 'mixed':
      return 'a mix of games, scrimmages and practice (scopes blended)';
    case 'unknown':
      return 'later sessions';
  }
}

/** Map a V7 follow-up verb onto the binding AI action type. */
function actionTypeFor(
  follow: EffectivenessRecommendedAction['follow_up'],
): EffectivenessRecommendedAction['type'] {
  switch (follow) {
    case 'move_to_individual_task':
      return 'task';
    case 'add_video_review':
      return 'practice_adjustment';
    case 'keep_monitoring':
      return 'note';
    default:
      return 'practice_adjustment';
  }
}

function recommend(
  follow: EffectivenessRecommendedAction['follow_up'],
  label: string,
): EffectivenessRecommendedAction {
  return { label, follow_up: follow, type: actionTypeFor(follow), owner_role: 'coach' };
}

// -----------------------------------------------------------------------------
// The measurement
// -----------------------------------------------------------------------------

/**
 * Measure one practiced objective's effect on later metric movement. Returns a
 * single honest review. Pure + deterministic.
 *
 * Decision order (each branch produces an honest, non-causal output):
 *   1. No tracked metric            -> direction 'not_tracked'.
 *   2. After-window too soon         -> direction 'too_early'.
 *   3. Either side under MIN_SIDE    -> direction 'insufficient_sample'.
 *   4. Measured but within band      -> direction 'stable', tier 'no_signal'.
 *   5. Sign-corrected move out of band -> 'improved' / 'worse',
 *                                        tier 'correlated_not_proven'.
 */
export function measureObjectiveEffectiveness(
  input: EffectivenessMeasurementInput,
): EffectivenessReview {
  const now = input.now ?? new Date();
  const metricId =
    input.targetMetric && isBaseballMetricId(input.targetMetric) ? input.targetMetric : null;
  const dedupeKey = dedupeKeyFor(input, metricId);

  const before = input.before;
  const after = input.after;
  const sampleBefore = before.length;
  const sampleAfter = after.length;
  const windowBeforeDays = spanDays(before);
  const windowAfterDays = spanDays(after);
  const afterScope = resolveAfterScope(after);

  const metricBefore = avgWeighted(before);
  const metricAfter = avgWeighted(after);

  // Attendance confounders — always recorded when an assigned player missed or
  // was limited (V7: "player did not attend practice", "player was limited/sore").
  const confounders: EffectivenessConfounder[] = [];
  const missed = input.attendance.filter((a) => !a.attended).map((a) => a.playerId);
  const limited = input.attendance.filter((a) => a.attended && a.limited).map((a) => a.playerId);
  if (missed.length > 0) {
    confounders.push({
      code: 'attendance_gap',
      reason: `${missed.length} assigned player(s) did not attend this practice — their later movement is not attributable to it.`,
    });
  }
  if (limited.length > 0) {
    confounders.push({
      code: 'attendance_gap',
      reason: `${limited.length} assigned player(s) were limited/sore — treat their results cautiously.`,
    });
  }
  if (afterScope === 'mixed') {
    confounders.push({
      code: 'mixed_scope',
      reason: 'The after window blends official games, scrimmages and practice — transfer is reported across mixed scopes, not a single clean read.',
    });
  }

  const metricLabel = metricId ? getBaseballMetricLabel(metricId) : input.targetMetric ?? input.focusArea;

  const sourceRefs: BaseballInsightSourceRef[] = [
    {
      table: 'baseball_practice_block_objectives',
      column: 'focus_area,target_metric,player_ids',
      id: input.objectiveId ?? undefined,
      sample_n: input.playerIds.length,
      visibility: 'staff_only',
      label: `Practiced: ${input.focusArea}`,
    },
  ];
  if (metricId) {
    sourceRefs.push({
      table: 'baseball_player_stats',
      column: metricId,
      sample_n: sampleBefore + sampleAfter,
      visibility: 'staff_only',
      label: `${metricLabel} before/after (${scopeLabel(afterScope)})`,
    });
  }

  const base = {
    teamId: input.teamId,
    practiceId: input.practiceId,
    objectiveId: input.objectiveId,
    focusArea: input.focusArea,
    metricId,
    playerIds: input.playerIds,
    linkedSignalIds: input.linkedSignalIds ?? [],
    metricBefore,
    metricAfter,
    sampleBefore,
    sampleAfter,
    windowBeforeDays,
    windowAfterDays,
    afterScope,
    confounders,
    sourceRefs,
    dedupeKey,
    generatedBy: PRACTICE_EFFECTIVENESS_ENGINE_ID,
  };

  // -- 1. No tracked metric ---------------------------------------------------
  if (!metricId) {
    return {
      ...base,
      direction: 'not_tracked',
      confidence: null,
      confidenceTier: 'no_signal',
      confounders: [
        ...confounders,
        {
          code: 'metric_inconsistent',
          reason: 'This focus area has no consistently-tracked metric, so transfer cannot be measured from box scores yet.',
        },
      ],
      conclusion: `Practiced "${input.focusArea}" but no consistently-tracked metric is attached, so CoachHelm cannot measure whether it transferred. Attach a target metric (or grade reps) to make this measurable.`,
      recommendedNextAction: recommend(
        'keep_monitoring',
        'Attach a target metric to this focus so future practices can be measured.',
      ),
    };
  }

  // -- 2. After-window too soon ----------------------------------------------
  const daysSincePractice = Math.round((now.getTime() - Date.parse(input.practiceDate)) / 86_400_000);
  const tooEarly =
    sampleAfter === 0 ||
    (Number.isFinite(daysSincePractice) && daysSincePractice < MIN_DAYS_TO_READ_AFTER);
  if (tooEarly) {
    return {
      ...base,
      direction: 'too_early',
      confidence: null,
      confidenceTier: 'too_early',
      confounders: [
        ...confounders,
        { code: sampleAfter === 0 ? 'no_after_window' : 'too_early', reason: 'No post-practice game/scrimmage/practice data in the transfer window yet.' },
      ],
      conclusion:
        sampleAfter === 0
          ? `Practiced "${input.focusArea}" (${metricLabel}); no games, scrimmages or practices have happened since, so transfer can't be read yet.`
          : `Practiced "${input.focusArea}" ${daysSincePractice} day(s) ago — too early to read transfer into ${metricLabel}. Check back after the next outing.`,
      recommendedNextAction: recommend('keep_monitoring', 'Re-measure after the next game or scrimmage.'),
    };
  }

  // -- 3. Insufficient sample on either side ---------------------------------
  if (sampleBefore < MIN_SIDE_SAMPLE || sampleAfter < MIN_SIDE_SAMPLE) {
    const thinSide = sampleBefore < MIN_SIDE_SAMPLE ? 'before' : 'after';
    return {
      ...base,
      direction: 'insufficient_sample',
      confidence: null,
      confidenceTier: 'not_enough_sample',
      confounders: [
        ...confounders,
        sampleBefore < MIN_SIDE_SAMPLE
          ? { code: 'no_before_window', reason: `Only ${sampleBefore} comparable session(s) before practice — not enough for a baseline.` }
          : { code: 'small_sample', reason: `Only ${sampleAfter} session(s) after practice — too thin to read transfer.` },
      ],
      conclusion: `Practiced "${input.focusArea}" (${metricLabel}), but the ${thinSide} sample is too small (${sampleBefore} before / ${sampleAfter} after) to say anything yet. Not enough sample.`,
      recommendedNextAction: recommend('keep_monitoring', 'Keep practicing this focus and re-measure as more games accumulate.'),
    };
  }

  // -- 4 & 5. We have a readable before/after. Resolve movement HONESTLY. -----
  // metricBefore/After are guaranteed non-null here (both sides ≥ MIN_SIDE_SAMPLE).
  const b = metricBefore as number;
  const a = metricAfter as number;
  const rawDelta = a - b;
  const sign = baseballImprovementSign(metricId); // +1 higher_better, -1 lower_better, 0 neutral
  const improvementDelta = rawDelta * sign; // >0 = better, <0 = worse, sign 0 = neutral metric

  // Relative magnitude vs the before value (guard divide-by-zero).
  const denom = Math.abs(b) > 1e-9 ? Math.abs(b) : 1;
  const relMove = Math.abs(rawDelta) / denom;

  // Confidence: smooth sample-adequacy on the THINNER side, fidelity-haircut, and
  // a hard correlation ceiling. NEVER reaches a "high"-readable value.
  const minSide = Math.min(sampleBefore, sampleAfter);
  const sampleAdequacy = Math.min(1, minSide / TARGET_SIDE_SAMPLE);
  const fidelity = getBaseballMetricFidelity(metricId);
  const fidelityFactor = fidelity === 'measured' ? 1 : fidelity === 'sensor_optional' ? 0.85 : 0.7;
  // Mixed scope erodes trust further.
  const scopeFactor = afterScope === 'mixed' ? 0.8 : afterScope === 'unknown' ? 0.7 : 1;
  // Attendance gaps erode trust (each missing assigned player matters more on a
  // small roster objective).
  const assignedN = Math.max(1, input.playerIds.length);
  const attendanceFactor = Math.max(0.5, 1 - missed.length / (assignedN * 2));
  const rawConfidence = sampleAdequacy * fidelityFactor * scopeFactor * attendanceFactor;
  const confidence = Math.max(0, Math.min(CORRELATION_CONFIDENCE_CEILING, rawConfidence));

  // -- 4. Neutral-threshold metric OR movement within the stable band --------
  if (sign === 0 || relMove < STABLE_REL_BAND) {
    return {
      ...base,
      direction: 'stable',
      confidence,
      confidenceTier: 'no_signal',
      conclusion:
        sign === 0
          ? `Practiced "${input.focusArea}" (${metricLabel}); this is a threshold/health metric with no "better" direction, so movement isn't scored as improvement.`
          : `Practiced "${input.focusArea}"; ${metricLabel} held about steady (${fmt(metricId, b)} → ${fmt(metricId, a)}) across ${scopeLabel(afterScope)}. No clear movement yet.`,
      recommendedNextAction: recommend('repeat', 'Hold the station as-is and re-measure; no change in metric yet.'),
    };
  }

  // -- 5. A real, sample-backed movement — association, NEVER proven ----------
  const improved = improvementDelta > 0;
  const direction: BaseballEffectivenessDirection = improved ? 'improved' : 'worse';
  const movePct = (relMove * 100).toFixed(0);

  const conclusion = improved
    ? `After practicing "${input.focusArea}", ${metricLabel} moved in the right direction (${fmt(metricId, b)} → ${fmt(metricId, a)}, ~${movePct}%) across ${scopeLabel(afterScope)} over ${sampleAfter} session(s). This is associated with improvement — correlation, not proof that the practice caused it.`
    : `After practicing "${input.focusArea}", ${metricLabel} moved the wrong way (${fmt(metricId, b)} → ${fmt(metricId, a)}, ~${movePct}%) across ${scopeLabel(afterScope)} over ${sampleAfter} session(s). The station has not shown transfer yet — this is correlation, not proof of cause.`;

  // Always note opponent/context as an un-controlled confounder for game scopes.
  const confoundersOut = [...confounders];
  if (afterScope === 'official_game' || afterScope === 'mixed') {
    confoundersOut.push({
      code: 'opponent_or_context_changed',
      reason: 'Opponent and game context vary outing-to-outing and are not controlled — they may explain part of the move.',
    });
  }

  return {
    ...base,
    direction,
    confidence,
    confidenceTier: 'correlated_not_proven',
    confounders: confoundersOut,
    conclusion,
    recommendedNextAction: improved
      ? recommend('progress', `Early positive signal — progress the "${input.focusArea}" station (raise difficulty) and keep measuring.`)
      : recommend('change_station_setup', `No transfer yet — change the "${input.focusArea}" station setup or add video review, then re-measure.`),
  };
}

// -----------------------------------------------------------------------------
// Value formatting per metric unit (keeps the conclusion sentence readable).
// -----------------------------------------------------------------------------

function fmt(metricId: string, v: number): string {
  const unit = getBaseballMetricUnit(metricId);
  switch (unit) {
    case 'percent':
      return `${(v * 100).toFixed(1)}%`;
    case 'avg':
      return v.toFixed(3);
    case 'mph':
      return `${v.toFixed(1)} mph`;
    case 'ratio':
      return v.toFixed(2);
    case 'innings':
      return v.toFixed(1);
    case 'count':
    default:
      return Math.round(v).toString();
  }
}

// -----------------------------------------------------------------------------
// Batch + roll-up
// -----------------------------------------------------------------------------

/** Measure many objectives. Pure; the action persists the result set. */
export function measureManyObjectives(
  inputs: EffectivenessMeasurementInput[],
): EffectivenessReview[] {
  return inputs.map((i) => measureObjectiveEffectiveness(i));
}

/**
 * Dashboard roll-up shape: per-focus-area aggregate measured return, plus the
 * "highest measured return" and "no evidence of transfer" buckets the V7
 * dashboard calls for. Honest by construction — only 'correlated_not_proven'
 * reviews count toward measured return; too-early/insufficient never inflate it.
 */
export interface FocusAreaRollup {
  focusArea: string;
  metricId: string | null;
  reviewCount: number;
  improved: number;
  worse: number;
  stable: number;
  /** Reviews that produced a sample-backed association (improved or worse). */
  measured: number;
  /** Reviews that could NOT be read (too_early/insufficient/not_tracked). */
  unmeasured: number;
  /** Mean confidence across the measured (correlated) reviews, or null. */
  meanConfidence: number | null;
  /** True when ≥1 review showed an associated improvement and none showed worse. */
  positiveSignal: boolean;
  /** True when there is sample but NO evidence of transfer (all stable/worse). */
  noEvidenceOfTransfer: boolean;
}

export function rollupByFocusArea(reviews: EffectivenessReview[]): FocusAreaRollup[] {
  const byFocus = new Map<string, EffectivenessReview[]>();
  for (const r of reviews) {
    const key = `${r.focusArea}::${r.metricId ?? ''}`;
    const arr = byFocus.get(key) ?? [];
    arr.push(r);
    byFocus.set(key, arr);
  }

  const out: FocusAreaRollup[] = [];
  for (const [, rs] of byFocus) {
    const improved = rs.filter((r) => r.direction === 'improved').length;
    const worse = rs.filter((r) => r.direction === 'worse').length;
    const stable = rs.filter((r) => r.direction === 'stable').length;
    const measured = improved + worse;
    const unmeasured = rs.length - measured - stable;
    const corr = rs.filter((r) => r.confidenceTier === 'correlated_not_proven' && r.confidence != null);
    const meanConfidence =
      corr.length > 0 ? corr.reduce((s, r) => s + (r.confidence ?? 0), 0) / corr.length : null;
    out.push({
      focusArea: rs[0]!.focusArea,
      metricId: rs[0]!.metricId,
      reviewCount: rs.length,
      improved,
      worse,
      stable,
      measured,
      unmeasured,
      meanConfidence,
      positiveSignal: improved > 0 && worse === 0,
      noEvidenceOfTransfer: measured + stable > 0 && improved === 0,
    });
  }
  // Highest measured return first (improved desc, then confidence desc).
  out.sort((x, y) => y.improved - x.improved || (y.meanConfidence ?? 0) - (x.meanConfidence ?? 0));
  return out;
}

/** Exported for tests + the registry-direction guard documentation. */
export const EFFECTIVENESS_CALIBRATION = {
  MIN_SIDE_SAMPLE,
  TARGET_SIDE_SAMPLE,
  MIN_DAYS_TO_READ_AFTER,
  STABLE_REL_BAND,
  CORRELATION_CONFIDENCE_CEILING,
} as const;

// Re-export the registry direction resolver so consumers reading this engine
// don't reach around it for sign logic (single source of truth).
export { getBaseballMetricDirection };
