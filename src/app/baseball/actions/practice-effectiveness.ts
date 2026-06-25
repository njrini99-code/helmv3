'use server';
import { fromUntyped } from '@/lib/supabase/untyped';

// =============================================================================
// src/app/baseball/actions/practice-effectiveness.ts
//
// Packet: practice-effectiveness (BaseballHelm CoachHelm Engine)
//
// Server actions for the Practice Effectiveness Engine. Three jobs:
//   1. Objective CRUD — capture WHAT was practiced (focus_area + target_metric +
//      assigned players + completion/reps) on a practice block. This is the
//      source layer the engine measures against (source -> signal -> action).
//   2. runPracticeEffectiveness — the engine: for every completed objective with
//      a tracked metric, measure later metric movement honestly and UPSERT a
//      review row (no delete-then-insert; dedupe_key keyed).
//   3. Disposition — dismiss / resolve / convert-to-task a review, and (coach-
//      only) flip a review player-visible.
//
// SECURITY / CONTRACT
//   * Every write runs inside withBaseballAction with
//     { featureArea: 'baseball-practice-effectiveness',
//       requiredCapability: 'can_manage_practice' }. Auth + active team +
//       capability are resolved + enforced SERVER-SIDE; the wrapper sanitizes
//       thrown errors so raw DB internals never reach the client.
//   * Reads are RLS-governed (reviews are staff_only by default; the 0090 policy
//     set lets players read ONLY explicitly player_visible reviews).
//   * NO destructive writes. Objectives stage-then-swap; reviews UPSERT on
//     (team_id, dedupe_key); disposition is an in-place UPDATE.
//   * team_id = ctx.targetTeamId is stamped on every insert so a row can never be
//     written against another team even if RLS were mis-set.
//   * NO AI/insight output without source refs: every review the engine writes
//     carries source_refs + confidence + visibility + generated_at + disposition
//     (the binding AI source contract) — produced by the pure engine module.
// =============================================================================

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { sanitizeDbError } from '@/lib/db-error';
import { withBaseballAction } from '@/lib/baseball/with-baseball-action';
import { loadPlayerMetrics, type BoxScoreRow } from '@/lib/coachhelm/baseball/loaders';
import {
  measureManyObjectives,
  PRACTICE_EFFECTIVENESS_ENGINE_ID,
  type EffectivenessMeasurementInput,
  type EffectivenessReview,
  type MeasurementPoint,
  type MeasurementScope,
  type ObjectiveAttendance,
} from '@/lib/coachhelm/baseball/effectiveness/engine';
import { isBaseballMetricId, type BaseballMetricId } from '@/lib/coachhelm/baseball/metrics/registry';
import { createTask } from '@/app/baseball/actions/tasks';
import type {
  BaseballObjectiveCompletionStatus,
  BaseballEffectivenessDisposition,
} from '@/lib/types/baseball-practice-effectiveness';

const EFFECTIVENESS_PATH = '/baseball/dashboard/practice-effectiveness';
const DECISION_ROOM_PATH = '/baseball/dashboard/decision-room';
const PRACTICE_PATH = '/baseball/dashboard/practice';

type ActionResult<T = unknown> = { success: boolean; error?: string; data?: T };

const FEATURE = {
  featureArea: 'baseball-practice-effectiveness',
  requiredCapability: 'can_manage_practice',
} as const;

// How far back to look for the BEFORE baseline window (days before the practice).
const BEFORE_WINDOW_DAYS = 30;
// How far forward to look for the AFTER transfer window (days after the practice).
const AFTER_WINDOW_DAYS = 21;
// Hard cap on box-score rows pulled per engine run (paginate-safe; well under the
// PostgREST 1000-row server max — a single team's season fits easily).
const STATS_LOOKBACK_LIMIT = 1000;

// -----------------------------------------------------------------------------
// 1. OBJECTIVE CRUD — capture WHAT was practiced.
// -----------------------------------------------------------------------------

export interface SaveObjectiveInput {
  objectiveId?: string;
  practiceId: string;
  blockId?: string | null;
  focusArea: string;
  objective?: string | null;
  /** Registry metric id (validated) or null. */
  targetMetric?: string | null;
  playerIds: string[];
  completionStatus?: BaseballObjectiveCompletionStatus;
  repsPlanned?: number | null;
  repsCompleted?: number | null;
  repsGradedCorrect?: number | null;
  notes?: string | null;
  videoUrl?: string | null;
}

export const saveObjective = withBaseballAction(
  'saveObjective',
  FEATURE,
  async (ctx, input: SaveObjectiveInput): Promise<ActionResult<{ objectiveId: string }>> => {
    const supabase = await createClient();
    const teamId = ctx.targetTeamId;

    // Only persist a target_metric the registry actually knows — otherwise null
    // so the engine honestly reports "metric not tracked consistently".
    const targetMetric =
      input.targetMetric && isBaseballMetricId(input.targetMetric) ? input.targetMetric : null;

    const base = {
      team_id: teamId,
      practice_id: input.practiceId,
      block_id: input.blockId ?? null,
      focus_area: input.focusArea.trim(),
      objective: input.objective?.trim() || null,
      target_metric: targetMetric,
      player_ids: input.playerIds,
      completion_status: input.completionStatus ?? 'planned',
      reps_planned: input.repsPlanned ?? null,
      reps_completed: input.repsCompleted ?? null,
      reps_graded_correct: input.repsGradedCorrect ?? null,
      notes: input.notes?.trim() || null,
      video_url: input.videoUrl?.trim() || null,
      updated_at: new Date().toISOString(),
    };

    let objectiveId = input.objectiveId ?? null;
    if (objectiveId) {
      const { error } = await fromUntyped(supabase, 'baseball_practice_block_objectives')
        .update(base)
        .eq('id', objectiveId)
        .eq('team_id', teamId);
      if (error) return { success: false, error: sanitizeDbError(error, 'practice') };
    } else {
      const { data, error } = await fromUntyped(supabase, 'baseball_practice_block_objectives')
        .insert({ ...base, created_by: ctx.activeCoachId ?? null, source_type: 'manual' })
        .select('id')
        .single();
      if (error) return { success: false, error: sanitizeDbError(error, 'practice') };
      objectiveId = (data as { id: string }).id;
    }

    revalidatePath(EFFECTIVENESS_PATH);
    return { success: true, data: { objectiveId } };
  },
);

export const deleteObjective = withBaseballAction(
  'deleteObjective',
  FEATURE,
  async (ctx, input: { objectiveId: string }): Promise<ActionResult> => {
    const supabase = await createClient();
    const { error } = await fromUntyped(supabase, 'baseball_practice_block_objectives')
      .delete()
      .eq('id', input.objectiveId)
      .eq('team_id', ctx.targetTeamId);
    if (error) return { success: false, error: sanitizeDbError(error, 'practice') };
    revalidatePath(EFFECTIVENESS_PATH);
    revalidatePath(PRACTICE_PATH);
    return { success: true };
  },
);

// -----------------------------------------------------------------------------
// 1b. OBJECTIVE READ — load the objectives attached to one practice, so the
//     planner's Objective sub-editor + the Recap flow can hydrate. RLS governs
//     visibility (staff manage; players read published-practice objectives); we
//     additionally scope by team so a row can never leak across teams. This is a
//     plain authed read shape — no separate capability gate beyond the wrapper.
// -----------------------------------------------------------------------------

export interface PracticeObjectiveView {
  id: string;
  practiceId: string;
  blockId: string | null;
  focusArea: string;
  objective: string | null;
  targetMetric: string | null;
  playerIds: string[];
  completionStatus: BaseballObjectiveCompletionStatus;
  repsPlanned: number | null;
  repsCompleted: number | null;
  repsGradedCorrect: number | null;
  notes: string | null;
  videoUrl: string | null;
}

export const getPracticeObjectives = withBaseballAction(
  'getPracticeObjectives',
  FEATURE,
  async (
    ctx,
    input: { practiceId: string },
  ): Promise<ActionResult<PracticeObjectiveView[]>> => {
    const supabase = await createClient();
    const { data, error } = await fromUntyped(supabase, 'baseball_practice_block_objectives')
      .select(
        'id, practice_id, block_id, focus_area, objective, target_metric, player_ids, completion_status, reps_planned, reps_completed, reps_graded_correct, notes, video_url',
      )
      .eq('team_id', ctx.targetTeamId)
      .eq('practice_id', input.practiceId)
      .order('created_at', { ascending: true });
    if (error) return { success: false, error: sanitizeDbError(error, 'practice') };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (data ?? []) as any[];
    const objectives: PracticeObjectiveView[] = rows.map((r) => ({
      id: r.id,
      practiceId: r.practice_id,
      blockId: r.block_id ?? null,
      focusArea: r.focus_area,
      objective: r.objective ?? null,
      targetMetric: r.target_metric ?? null,
      playerIds: (r.player_ids ?? []) as string[],
      completionStatus: (r.completion_status ?? 'planned') as BaseballObjectiveCompletionStatus,
      repsPlanned: r.reps_planned ?? null,
      repsCompleted: r.reps_completed ?? null,
      repsGradedCorrect: r.reps_graded_correct ?? null,
      notes: r.notes ?? null,
      videoUrl: r.video_url ?? null,
    }));
    return { success: true, data: objectives };
  },
);

// -----------------------------------------------------------------------------
// 1c. PRACTICE RECAP — the v10-mandated "human-entered completion notes and
//     effectiveness measurement" flow. Per objective: completion_status +
//     reps_completed + reps_graded_correct + notes + video_url, persisted via the
//     same objective rows (the engine's input set). After the recap is saved the
//     effectiveness engine is run inline (one round-trip for the coach) so the
//     freshly-completed objectives are measured immediately — closing the
//     source -> signal -> review loop the v10 delta calls the REPLACEMENT for a
//     generated practice recap. NON-destructive: per-row UPDATEs only.
// -----------------------------------------------------------------------------

export interface RecapEntryInput {
  objectiveId: string;
  completionStatus: BaseballObjectiveCompletionStatus;
  repsCompleted?: number | null;
  repsGradedCorrect?: number | null;
  notes?: string | null;
  videoUrl?: string | null;
}

export interface SaveRecapResult extends ActionResult {
  /** The engine roll-up after the recap (null when the engine could not run). */
  effectiveness?: RunEffectivenessResult | null;
}

export const savePracticeRecap = withBaseballAction(
  'savePracticeRecap',
  FEATURE,
  async (
    ctx,
    input: { practiceId: string; entries: RecapEntryInput[]; autoMeasure?: boolean },
  ): Promise<SaveRecapResult> => {
    const supabase = await createClient();
    const teamId = ctx.targetTeamId;

    if (input.entries.length === 0) {
      return { success: true, effectiveness: null };
    }

    // Sanitize reps: non-negative integers or null; graded-correct can never
    // exceed completed (an honest grading invariant the engine relies on).
    const cleanInt = (v: number | null | undefined): number | null => {
      if (v == null || !Number.isFinite(v)) return null;
      const n = Math.max(0, Math.round(v));
      return n;
    };

    const nowIso = new Date().toISOString();
    for (const e of input.entries) {
      const repsCompleted = cleanInt(e.repsCompleted);
      let repsGraded = cleanInt(e.repsGradedCorrect);
      if (repsGraded != null && repsCompleted != null && repsGraded > repsCompleted) {
        repsGraded = repsCompleted;
      }
      const { error } = await fromUntyped(supabase, 'baseball_practice_block_objectives')
        .update({
          completion_status: e.completionStatus,
          reps_completed: repsCompleted,
          reps_graded_correct: repsGraded,
          notes: e.notes?.trim() || null,
          video_url: e.videoUrl?.trim() || null,
          updated_at: nowIso,
        })
        .eq('id', e.objectiveId)
        .eq('team_id', teamId)
        .eq('practice_id', input.practiceId);
      if (error) return { success: false, error: sanitizeDbError(error, 'practice') };
    }

    revalidatePath(EFFECTIVENESS_PATH);
    revalidatePath(PRACTICE_PATH);

    // Auto-run the engine so a coach sees measurement the moment the recap is
    // saved (the source -> signal -> review wiring). Default on; the engine is
    // honest about thin/too-early data, so an early run never fabricates a read.
    if (input.autoMeasure === false) {
      return { success: true, effectiveness: null };
    }
    const effectiveness = await measureForTeam(teamId, supabase);
    return { success: true, effectiveness };
  },
);

// -----------------------------------------------------------------------------
// 1d. ASSIGN PLAYER TASK FROM RECAP — the v7 §Practice Recap "assign player task"
//     hook. Turns a completion observation (a focus that was partial/skipped, or
//     a follow-up the coach wants to lock in) into a REAL assigned task on the
//     existing baseball task subsystem (source -> signal -> action), so the recap
//     is not a dead-end note. Capability-enforced via the wrapper; the task is
//     created against ctx.targetTeamId and assigned to the objective's players (or
//     an explicit subset). Delegates to the canonical createTask so there is ONE
//     task-write implementation. The objective row is the SOURCE the task cites.
// -----------------------------------------------------------------------------

export interface AssignRecapTaskInput {
  /** The objective this follow-up is derived from (source provenance). */
  objectiveId: string;
  practiceId: string;
  title: string;
  description?: string | null;
  dueDate?: string | null;
  /** Players to assign. Defaults to the objective's assigned players. */
  playerIds?: string[];
}

export const assignRecapTask = withBaseballAction(
  'assignRecapTask',
  FEATURE,
  async (
    ctx,
    input: AssignRecapTaskInput,
  ): Promise<ActionResult<{ taskId: string }>> => {
    const title = input.title.trim();
    if (!title) return { success: false, error: 'A task needs a title.' };

    const supabase = await createClient();
    const teamId = ctx.targetTeamId;

    // Resolve the assignee set: explicit subset, else the objective's players.
    let playerIds = (input.playerIds ?? []).filter(Boolean);
    if (playerIds.length === 0) {
      const { data: obj } = await fromUntyped(supabase, 'baseball_practice_block_objectives')
        .select('player_ids')
        .eq('id', input.objectiveId)
        .eq('team_id', teamId)
        .maybeSingle();
      playerIds = ((obj as { player_ids: string[] } | null)?.player_ids ?? []).filter(Boolean);
    }
    if (playerIds.length === 0) {
      return { success: false, error: 'Assign at least one player to this task.' };
    }

    // Delegate to the canonical task writer (ONE task-write path). It runs its own
    // coach auth check; the wrapper has already enforced can_manage_practice for
    // THIS feature area, so a stats-only coach never reaches here.
    const res = await createTask(teamId, {
      title,
      description: input.description?.trim() || undefined,
      due_date: input.dueDate || undefined,
      category: 'practice',
      priority: 'normal',
      player_ids: playerIds,
    });
    if (!res.success || !res.data) {
      return { success: false, error: res.error ?? 'Could not create the task.' };
    }

    revalidatePath(PRACTICE_PATH);
    return { success: true, data: { taskId: res.data.taskId } };
  },
);

// -----------------------------------------------------------------------------
// 2. THE ENGINE — measure transfer for every completed, metric-tracked objective.
// -----------------------------------------------------------------------------

export interface RunEffectivenessResult {
  success: boolean;
  measured: number;
  improved: number;
  worse: number;
  tooEarly: number;
  insufficient: number;
  error?: string;
}

/** Normalize a stat_type string onto an engine measurement scope. */
function scopeFor(statType: string | null): MeasurementScope {
  const v = (statType ?? '').toLowerCase();
  if (v === 'game' || v === 'official' || v === 'official_game') return 'official_game';
  if (v === 'scrimmage' || v === 'intrasquad') return 'scrimmage';
  return 'practice';
}

/**
 * Compute ONE session's value of a metric from a box-score row, reusing the
 * loader's metric math (so the engine and the insight generators share ONE
 * implementation and can never disagree on, e.g., how K-rate is computed).
 * Returns { value, weight } or null when the row has no data for the metric.
 */
function sessionMetricValue(
  metricId: BaseballMetricId,
  row: BoxScoreRow,
): { value: number; weight: number } | null {
  // Load the single row through the shared loader and read back the metric. This
  // is intentionally not the season aggregate — we want per-session points so the
  // before/after windows are real session-by-session reads.
  const loaded = loadPlayerMetrics(row.player_id, [row]);
  const m = loaded.metrics[metricId];
  if (!m || m.value == null) return null;
  return { value: m.value, weight: Math.max(1, m.sample_n) };
}

export const runPracticeEffectiveness = withBaseballAction(
  'runPracticeEffectiveness',
  FEATURE,
  async (ctx): Promise<RunEffectivenessResult> => {
    const supabase = await createClient();
    return measureForTeam(ctx.targetTeamId, supabase);
  },
);

/**
 * The pure-ish engine driver, shared by runPracticeEffectiveness and the recap
 * auto-run. It loads completed objectives + box scores + attendance, shapes the
 * pure-engine inputs, runs measureManyObjectives, and UPSERTs the reviews. It
 * takes an already-resolved teamId + authed supabase client so it can be called
 * from inside another withBaseballAction body without re-resolving context. NOT
 * exported as a server action.
 */
async function measureForTeam(
  teamId: string,
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<RunEffectivenessResult> {
  {
    const now = new Date();

    // ---- LOAD completed objectives with a tracked metric --------------------
    const { data: objRows, error: objErr } = await fromUntyped(supabase, 'baseball_practice_block_objectives')
      .select('id, practice_id, focus_area, target_metric, player_ids, completion_status')
      .eq('team_id', teamId)
      .in('completion_status', ['completed', 'partial']);
    if (objErr) {
      return { success: false, measured: 0, improved: 0, worse: 0, tooEarly: 0, insufficient: 0, error: 'Could not load practice objectives.' };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const objectives = (objRows ?? []) as any[];
    if (objectives.length === 0) {
      return { success: true, measured: 0, improved: 0, worse: 0, tooEarly: 0, insufficient: 0 };
    }

    // ---- LOAD practice dates for those objectives ---------------------------
    const practiceIds = [...new Set(objectives.map((o) => o.practice_id as string))];
    const { data: practiceRows } = await fromUntyped(supabase, 'baseball_practices')
      .select('id, created_at, published_at')
      .in('id', practiceIds)
      .eq('team_id', teamId);
    const practiceDate = new Map<string, string>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of (practiceRows ?? []) as any[]) {
      practiceDate.set(p.id, p.published_at ?? p.created_at);
    }

    // ---- LOAD box scores for all assigned players ---------------------------
    const allPlayerIds = [
      ...new Set(objectives.flatMap((o) => (o.player_ids ?? []) as string[])),
    ];
    if (allPlayerIds.length === 0) {
      return { success: true, measured: 0, improved: 0, worse: 0, tooEarly: 0, insufficient: 0 };
    }
    const { data: statRows, error: statsErr } = await supabase
      .from('baseball_player_stats')
      .select(
        'id, player_id, stat_type, session_date, at_bats, hits, doubles, triples, home_runs, walks, strikeouts, innings_pitched, earned_runs, walks_allowed, strikeouts_thrown, exit_velocity, pitch_velocity',
      )
      .eq('team_id', teamId)
      .in('player_id', allPlayerIds)
      .order('session_date', { ascending: false })
      .limit(STATS_LOOKBACK_LIMIT);
    if (statsErr) {
      return { success: false, measured: 0, improved: 0, worse: 0, tooEarly: 0, insufficient: 0, error: 'Could not load box-score stats.' };
    }
    const stats = (statRows ?? []) as unknown as BoxScoreRow[];

    // ---- LOAD attendance for those practices --------------------------------
    const { data: attRows } = await fromUntyped(supabase, 'baseball_practice_attendance')
      .select('practice_id, player_id, status')
      .in('practice_id', practiceIds)
      .eq('team_id', teamId);
    const attByPractice = new Map<string, Map<string, string>>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const a of (attRows ?? []) as any[]) {
      const m = attByPractice.get(a.practice_id) ?? new Map<string, string>();
      m.set(a.player_id, a.status);
      attByPractice.set(a.practice_id, m);
    }

    // ---- BUILD measurement inputs (pure data shaping) -----------------------
    const inputs: EffectivenessMeasurementInput[] = [];
    for (const o of objectives) {
      const metricId =
        o.target_metric && isBaseballMetricId(o.target_metric)
          ? (o.target_metric as BaseballMetricId)
          : null;
      const pDateIso = practiceDate.get(o.practice_id);
      if (!pDateIso) continue;
      const pTs = Date.parse(pDateIso);
      const assigned = (o.player_ids ?? []) as string[];

      const before: MeasurementPoint[] = [];
      const after: MeasurementPoint[] = [];

      if (metricId) {
        const beforeFloor = pTs - BEFORE_WINDOW_DAYS * 86_400_000;
        const afterCeil = pTs + AFTER_WINDOW_DAYS * 86_400_000;
        for (const row of stats) {
          if (!assigned.includes(row.player_id)) continue;
          if (!row.session_date) continue;
          const ts = Date.parse(row.session_date);
          if (!Number.isFinite(ts)) continue;
          const computed = sessionMetricValue(metricId, row);
          if (!computed) continue;
          const point: MeasurementPoint = {
            playerId: row.player_id,
            date: row.session_date,
            value: computed.value,
            scope: scopeFor(row.stat_type),
            weight: computed.weight,
          };
          if (ts >= beforeFloor && ts < pTs) before.push(point);
          else if (ts > pTs && ts <= afterCeil) after.push(point);
        }
      }

      const att = attByPractice.get(o.practice_id) ?? new Map<string, string>();
      const attendance: ObjectiveAttendance[] = assigned.map((pid) => {
        const status = att.get(pid);
        return {
          playerId: pid,
          attended: status === 'present' || status === 'limited',
          limited: status === 'limited',
        };
      });

      inputs.push({
        teamId,
        practiceId: o.practice_id,
        objectiveId: o.id,
        focusArea: o.focus_area,
        targetMetric: o.target_metric ?? null,
        playerIds: assigned,
        practiceDate: pDateIso,
        before,
        after,
        attendance,
        now,
      });
    }

    // ---- RUN the pure engine -----------------------------------------------
    const reviews: EffectivenessReview[] = measureManyObjectives(inputs);
    if (reviews.length === 0) {
      return { success: true, measured: 0, improved: 0, worse: 0, tooEarly: 0, insufficient: 0 };
    }

    // ---- PERSIST — UPSERT on (team_id, dedupe_key); never delete-then-insert -
    const nowIso = now.toISOString();
    const expiresIso = new Date(now.getTime() + 30 * 86_400_000).toISOString();
    const rows = reviews.map((r) => ({
      team_id: r.teamId,
      practice_id: r.practiceId,
      objective_id: r.objectiveId,
      focus_area: r.focusArea,
      metric_id: r.metricId,
      player_ids: r.playerIds,
      linked_signal_ids: r.linkedSignalIds,
      metric_before: r.metricBefore,
      metric_after: r.metricAfter,
      sample_before: r.sampleBefore,
      sample_after: r.sampleAfter,
      window_before_days: r.windowBeforeDays,
      window_after_days: r.windowAfterDays,
      direction: r.direction,
      after_scope: r.afterScope,
      confidence: r.confidence,
      confidence_tier: r.confidenceTier,
      confounders: r.confounders,
      conclusion: r.conclusion,
      recommended_next_action: r.recommendedNextAction,
      source_refs: r.sourceRefs,
      // Reviews are staff_only by default (they blend scopes + carry confounders).
      visibility: 'staff_only',
      disposition: 'new',
      generated_by: r.generatedBy,
      generated_by_model: PRACTICE_EFFECTIVENESS_ENGINE_ID,
      generated_at: nowIso,
      expires_at: expiresIso,
      dedupe_key: r.dedupeKey,
      updated_at: nowIso,
    }));

    const { error: upsertErr } = await fromUntyped(supabase, 'baseball_practice_effectiveness_reviews').upsert(rows, { onConflict: 'team_id,dedupe_key', ignoreDuplicates: false });
    if (upsertErr) {
      return { success: false, measured: 0, improved: 0, worse: 0, tooEarly: 0, insufficient: 0, error: 'Could not save effectiveness reviews.' };
    }

    revalidatePath(EFFECTIVENESS_PATH);
    revalidatePath(DECISION_ROOM_PATH);

    return {
      success: true,
      measured: reviews.filter((r) => r.confidenceTier === 'correlated_not_proven').length,
      improved: reviews.filter((r) => r.direction === 'improved').length,
      worse: reviews.filter((r) => r.direction === 'worse').length,
      tooEarly: reviews.filter((r) => r.direction === 'too_early').length,
      insufficient: reviews.filter((r) => r.direction === 'insufficient_sample').length,
    };
  }
}

// -----------------------------------------------------------------------------
// 3. DISPOSITION — dismiss / resolve / convert; flip visibility (coach decision).
// -----------------------------------------------------------------------------

export const setReviewDisposition = withBaseballAction(
  'setReviewDisposition',
  FEATURE,
  async (
    ctx,
    input: { reviewId: string; disposition: BaseballEffectivenessDisposition },
  ): Promise<ActionResult> => {
    const supabase = await createClient();
    const { error } = await fromUntyped(supabase, 'baseball_practice_effectiveness_reviews')
      .update({ disposition: input.disposition, updated_at: new Date().toISOString() })
      .eq('id', input.reviewId)
      .eq('team_id', ctx.targetTeamId);
    if (error) return { success: false, error: sanitizeDbError(error, 'practice') };
    revalidatePath(EFFECTIVENESS_PATH);
    revalidatePath(DECISION_ROOM_PATH);
    return { success: true };
  },
);

/**
 * Flip a review player-visible (or back to staff-only). A coach decision only —
 * the engine NEVER auto-publishes a review to players (scopes are blended + the
 * conclusion carries staff confounders). The RLS player-read policy honors the
 * flag; the supportive player-facing wording is the conclusion as written.
 */
export const setReviewVisibility = withBaseballAction(
  'setReviewVisibility',
  FEATURE,
  async (
    ctx,
    input: { reviewId: string; playerVisible: boolean },
  ): Promise<ActionResult> => {
    const supabase = await createClient();
    const { error } = await fromUntyped(supabase, 'baseball_practice_effectiveness_reviews')
      .update({
        visibility: input.playerVisible ? 'player_visible' : 'staff_only',
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.reviewId)
      .eq('team_id', ctx.targetTeamId);
    if (error) return { success: false, error: sanitizeDbError(error, 'practice') };
    revalidatePath(EFFECTIVENESS_PATH);
    return { success: true };
  },
);
