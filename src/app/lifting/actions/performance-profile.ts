'use server';

// =============================================================================
// src/app/lifting/actions/performance-profile.ts
//
// Helm Lifting Lab — Player Performance Profile server actions.
//
//   getPlayerPerformanceProfile  — header snapshot: current weight, 30-day
//     change, last soreness status, lift-completion %, active nutrition plan,
//     and latest PR.
//
//   getPlayerLiftProgression     — per-exercise top set / estimated 1RM /
//     weekly volume / PR markers. Reads from helm_lifting_set_results +
//     helm_lifting_session_exercises + helm_lifting_sessions.
//
//   getPlayerPerformanceCompliance — lift / soreness / weight / readiness
//     completion rates for a configurable window.
//
// Coach-viewing-an-athlete:   pass orgId + athleteId (requireEdit: false because
//                             reads are guarded by canView in withLiftingAction).
// Athlete self-view:          pass orgId only; athleteId resolved from auth.
//
// All three are READ-ONLY: no revalidatePath calls needed (no mutations here).
// revalidatePath is only added as a no-op comment to clarify intent.
// =============================================================================

import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { withLiftingAction, LiftingActionError } from '@/lib/lifting/with-lifting-action';
import type {
  HelmLiftingReadinessBand,
  HelmLiftingPrType,
} from '@/lib/types/helm-lifting-data';
import type {
  NutritionPlan,
  SorenessStatus,
  SorenessCheckinStatus,
  WeightCheckinStatus,
} from '@/lib/types/helm-lifting-checkins';

// =============================================================================
// Shared validation helpers
// =============================================================================

const uuid = z.string().uuid();
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

// =============================================================================
// Internal helpers
// =============================================================================

/**
 * Epley estimated 1RM: load × (1 + reps / 30).
 * Returns null if load or reps is <= 0.
 * Used for single-set estimation when no dedicated max row exists.
 */
function epley1RM(load: number, reps: number): number | null {
  if (load <= 0 || reps <= 0) return null;
  if (reps === 1) return load; // 1-rep max is the load itself
  return Math.round(load * (1 + reps / 30));
}

/**
 * Return today as YYYY-MM-DD using the server's local date.
 * Callers may override via an explicit `asOf` parameter.
 */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Subtract N days from an ISO date string.
 */
function daysAgo(isoDate: string, n: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Resolve the athlete_id for the calling user (self-view path).
 * Returns null if the user is not an athlete in this org.
 */
async function resolveSelfAthleteId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  userId: string,
): Promise<string | null> {
  const { data } = await fromUntyped(supabase, 'helm_lifting_athletes')
    .select('id')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle() as { data: { id: string } | null };
  return data?.id ?? null;
}

// =============================================================================
// Domain types for returned data shapes
//
// These are export-level types consumed by client components.
// =============================================================================

/** Minimal athlete snapshot embedded in every profile result. */
export interface ProfileAthlete {
  id: string;
  first_name: string | null;
  last_name: string | null;
  position: string | null;
  sport: 'baseball' | 'golf';
}

/** The latest personal record across any exercise. */
export interface LatestPR {
  exercise_id: string;
  exercise_name: string;
  pr_type: HelmLiftingPrType;
  value: number;
  unit: string;
  achieved_at: string;
}

/** Compact nutrition plan for the header card. */
export interface ActiveNutritionPlanSummary {
  id: string;
  title: string;
  plan_type: NutritionPlan['plan_type'];
  external_url: string | null;
  storage_path: string | null;
  file_name: string | null;
  published_at: string | null;
}

/**
 * Header snapshot returned by getPlayerPerformanceProfile.
 * Designed for the "at a glance" profile card at the top of a player page.
 */
export interface PlayerPerformanceProfile {
  athlete: ProfileAthlete;

  /** Most recent bodyweight entry (null if never logged). */
  currentWeightLbs: number | null;
  /** Entry date of currentWeightLbs. */
  weightEntryDate: string | null;
  /**
   * Weight change over the last 30 days in lbs (positive = gained, negative = lost).
   * Null when fewer than 2 entries exist in the window.
   */
  weightChange30d: number | null;

  /** Soreness status from the most recent readiness check-in. */
  lastSorenessStatus: SorenessStatus | null;
  /** Readiness band from the most recent check-in. */
  lastReadinessBand: HelmLiftingReadinessBand | null;
  /** Date of the most recent readiness check-in. */
  lastCheckinDate: string | null;

  /**
   * Lift-completion percentage in the last 30 days.
   * Computed as completed / (completed + missed) sessions.
   * Null when no sessions exist in the window.
   */
  liftCompletionPct30d: number | null;

  /** Active nutrition plan assigned to this athlete (most recent). */
  activeNutritionPlan: ActiveNutritionPlanSummary | null;

  /** Most recently achieved PR across all exercises. */
  latestPR: LatestPR | null;
}

// -----------------------------------------------------------------------------
// getPlayerPerformanceProfile
// -----------------------------------------------------------------------------

const performanceProfileSchema = z.object({
  orgId: uuid,
  /** Coach-viewing-an-athlete path. Omit for self-view (athlete calling). */
  athleteId: uuid.optional().nullable(),
});

export const getPlayerPerformanceProfile = withLiftingAction(
  'getPlayerPerformanceProfile',
  {
    featureArea: 'lifting-performance-profile',
    requireEdit: false,
    orgFrom: (...args) => (args[0] as { orgId?: string })?.orgId,
  },
  async (ctx, raw: z.input<typeof performanceProfileSchema>): Promise<PlayerPerformanceProfile> => {
    const input = performanceProfileSchema.parse(raw);
    const supabase = await createClient();

    // ── Resolve athlete ───────────────────────────────────────────────────────
    let athleteId = input.athleteId ?? null;
    if (!athleteId) {
      // Self-view: calling user must be an athlete in this org
      athleteId = await resolveSelfAthleteId(supabase, ctx.orgId, ctx.user.id);
      if (!athleteId) throw new LiftingActionError('No athlete profile found for this user.');
    }

    // Verify athlete belongs to org and is active
    const { data: athleteRow } = await fromUntyped(supabase, 'helm_lifting_athletes')
      .select('id, first_name, last_name, position, sport')
      .eq('id', athleteId)
      .eq('organization_id', ctx.orgId)
      .eq('is_active', true)
      .maybeSingle() as {
        data: {
          id: string;
          first_name: string | null;
          last_name: string | null;
          position: string | null;
          sport: string;
        } | null;
      };

    if (!athleteRow) throw new LiftingActionError('Athlete not found in this org.');

    const athlete: ProfileAthlete = {
      id: athleteRow.id,
      first_name: athleteRow.first_name,
      last_name: athleteRow.last_name,
      position: athleteRow.position,
      sport: athleteRow.sport as 'baseball' | 'golf',
    };

    const referenceDate = today();
    const window30Start = daysAgo(referenceDate, 30);

    // ── Weight ────────────────────────────────────────────────────────────────
    // Fetch up to 60 days of bodyweight entries, sorted descending by date.
    const { data: weightRows } = await fromUntyped(supabase, 'helm_lifting_bodyweight_entries')
      .select('entry_date, weight_lbs')
      .eq('athlete_id', athleteId)
      .gte('entry_date', daysAgo(referenceDate, 60))
      .order('entry_date', { ascending: false })
      .limit(100) as {
        data: Array<{ entry_date: string; weight_lbs: number }> | null;
      };

    const weights = weightRows ?? [];
    const latestWeight = weights[0] ?? null;
    let weightChange30d: number | null = null;

    if (latestWeight) {
      // Find the earliest entry within the 30-day window to compute delta
      const inWindow = weights.filter((w) => w.entry_date >= window30Start);
      const earliest30 = inWindow[inWindow.length - 1];
      if (earliest30 && earliest30.entry_date !== latestWeight.entry_date) {
        weightChange30d =
          Math.round((latestWeight.weight_lbs - earliest30.weight_lbs) * 10) / 10;
      }
    }

    // ── Latest readiness check-in ─────────────────────────────────────────────
    const { data: checkinRow } = await fromUntyped(supabase, 'helm_lifting_readiness_checkins')
      .select('checkin_date, readiness_band, soreness_status')
      .eq('athlete_id', athleteId)
      .order('checkin_date', { ascending: false })
      .limit(1)
      .maybeSingle() as {
        data: {
          checkin_date: string;
          readiness_band: string | null;
          soreness_status: string | null;
        } | null;
      };

    // ── Lift completion (30 days) ─────────────────────────────────────────────
    const { data: sessionRows } = await fromUntyped(supabase, 'helm_lifting_sessions')
      .select('status')
      .eq('athlete_id', athleteId)
      .gte('scheduled_date', window30Start)
      .lte('scheduled_date', referenceDate)
      .in('status', ['completed', 'missed']) as {
        data: Array<{ status: string }> | null;
      };

    let liftCompletionPct30d: number | null = null;
    if (sessionRows && sessionRows.length > 0) {
      const completed = sessionRows.filter((s) => s.status === 'completed').length;
      liftCompletionPct30d = Math.round((completed / sessionRows.length) * 100);
    }

    // ── Active nutrition plan ─────────────────────────────────────────────────
    // Join plan_assignments + plans: athlete-level assignment first, then team.
    const { data: planAssignmentRows } = await fromUntyped(
      supabase,
      'helm_lifting_nutrition_plan_assignments',
    )
      .select('plan_id, assigned_at')
      .eq('athlete_id', athleteId)
      .order('assigned_at', { ascending: false })
      .limit(1) as {
        data: Array<{ plan_id: string; assigned_at: string }> | null;
      };

    let activeNutritionPlan: ActiveNutritionPlanSummary | null = null;
    const planId = planAssignmentRows?.[0]?.plan_id ?? null;

    if (planId) {
      const { data: planRow } = await fromUntyped(supabase, 'helm_lifting_nutrition_plans')
        .select('id, title, plan_type, external_url, storage_path, file_name, published_at, status')
        .eq('id', planId)
        .maybeSingle() as {
          data: {
            id: string;
            title: string;
            plan_type: string;
            external_url: string | null;
            storage_path: string | null;
            file_name: string | null;
            published_at: string | null;
            status: string;
          } | null;
        };

      if (planRow && planRow.status === 'published') {
        activeNutritionPlan = {
          id: planRow.id,
          title: planRow.title,
          plan_type: planRow.plan_type as NutritionPlan['plan_type'],
          external_url: planRow.external_url,
          storage_path: planRow.storage_path,
          file_name: planRow.file_name,
          published_at: planRow.published_at,
        };
      }
    }

    // ── Latest PR ─────────────────────────────────────────────────────────────
    const { data: prRows } = await fromUntyped(supabase, 'helm_lifting_prs')
      .select('exercise_id, pr_type, value, unit, achieved_at')
      .eq('athlete_id', athleteId)
      .order('achieved_at', { ascending: false })
      .limit(1) as {
        data: Array<{
          exercise_id: string;
          pr_type: string;
          value: number;
          unit: string;
          achieved_at: string;
        }> | null;
      };

    let latestPR: LatestPR | null = null;
    if (prRows && prRows.length > 0) {
      const pr = prRows[0]!;
      // Resolve exercise name
      const { data: exRow } = await fromUntyped(supabase, 'helm_lifting_exercises')
        .select('name')
        .eq('id', pr.exercise_id)
        .maybeSingle() as { data: { name: string } | null };

      latestPR = {
        exercise_id: pr.exercise_id,
        exercise_name: exRow?.name ?? 'Unknown exercise',
        pr_type: pr.pr_type as HelmLiftingPrType,
        value: pr.value,
        unit: pr.unit,
        achieved_at: pr.achieved_at,
      };
    }

    return {
      athlete,
      currentWeightLbs: latestWeight?.weight_lbs ?? null,
      weightEntryDate: latestWeight?.entry_date ?? null,
      weightChange30d,
      lastSorenessStatus: (checkinRow?.soreness_status ?? null) as SorenessStatus | null,
      lastReadinessBand: (checkinRow?.readiness_band ?? null) as HelmLiftingReadinessBand | null,
      lastCheckinDate: checkinRow?.checkin_date ?? null,
      liftCompletionPct30d,
      activeNutritionPlan,
      latestPR,
    };
  },
);

// =============================================================================
// getPlayerLiftProgression
// =============================================================================

/** Top-set data for one exercise on a given session date. */
export interface ExerciseTopSet {
  /** The actual date of the session this set was logged in. */
  sessionDate: string;
  /** Actual load recorded (null if bodyweight/time-based). */
  loadLbs: number | null;
  actualReps: number | null;
  rpe: number | null;
  /** Epley estimated 1RM from this set. Null for bodyweight exercises. */
  est1RM: number | null;
}

/** PR marker for one exercise. */
export interface ExercisePRMarker {
  pr_type: HelmLiftingPrType;
  value: number;
  unit: string;
  achieved_at: string;
}

/**
 * Progression data for a single exercise.
 * Returned as an array keyed by exercise, sorted by exercise name.
 */
export interface ExerciseProgression {
  exercise_id: string;
  exercise_name: string;
  /** All top-set data points in the requested window (ascending by date). */
  topSets: ExerciseTopSet[];
  /**
   * Total weekly volume (load × reps) for each calendar week, in lbs.
   * Keyed by ISO week-start (Monday YYYY-MM-DD).
   */
  weeklyVolume: Record<string, number>;
  /** All PRs for this exercise. */
  prMarkers: ExercisePRMarker[];
}

const liftProgressionSchema = z.object({
  orgId: uuid,
  athleteId: uuid.optional().nullable(),
  /** Inclusive start of the progression window (YYYY-MM-DD). Default: 90 days ago. */
  dateFrom: ymd.optional().nullable(),
  /** Inclusive end of the progression window (YYYY-MM-DD). Default: today. */
  dateTo: ymd.optional().nullable(),
  /**
   * Maximum number of distinct exercises to return.
   * Defaults to 20. Caller may request more for a full history export.
   */
  maxExercises: z.number().int().min(1).max(100).optional(),
});

/**
 * ISO week start (Monday) for a given YYYY-MM-DD date string.
 * E.g. "2026-06-25" (Wednesday) → "2026-06-22".
 */
function isoWeekStart(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  // JS Date: 0=Sunday, 1=Monday … 6=Saturday
  // Convert so Monday=0: (day + 6) % 7
  const dayOfWeek = d.getUTCDay(); // 0=Sun
  const offset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

export const getPlayerLiftProgression = withLiftingAction(
  'getPlayerLiftProgression',
  {
    featureArea: 'lifting-performance-profile',
    requireEdit: false,
    orgFrom: (...args) => (args[0] as { orgId?: string })?.orgId,
  },
  async (ctx, raw: z.input<typeof liftProgressionSchema>): Promise<ExerciseProgression[]> => {
    const input = liftProgressionSchema.parse(raw);
    const supabase = await createClient();

    // ── Resolve athlete ───────────────────────────────────────────────────────
    let athleteId = input.athleteId ?? null;
    if (!athleteId) {
      athleteId = await resolveSelfAthleteId(supabase, ctx.orgId, ctx.user.id);
      if (!athleteId) throw new LiftingActionError('No athlete profile found for this user.');
    }

    // Verify athlete belongs to this org
    const { data: athleteCheck } = await fromUntyped(supabase, 'helm_lifting_athletes')
      .select('id')
      .eq('id', athleteId)
      .eq('organization_id', ctx.orgId)
      .maybeSingle() as { data: { id: string } | null };

    if (!athleteCheck) throw new LiftingActionError('Athlete not found in this org.');

    const referenceDate = today();
    const dateFrom = input.dateFrom ?? daysAgo(referenceDate, 90);
    const dateTo = input.dateTo ?? referenceDate;
    const maxExercises = input.maxExercises ?? 20;

    // ── Fetch completed sessions in the window ────────────────────────────────
    const { data: sessions } = await fromUntyped(supabase, 'helm_lifting_sessions')
      .select('id, scheduled_date')
      .eq('athlete_id', athleteId)
      .eq('status', 'completed')
      .gte('scheduled_date', dateFrom)
      .lte('scheduled_date', dateTo)
      .order('scheduled_date', { ascending: true })
      .limit(500) as {
        data: Array<{ id: string; scheduled_date: string }> | null;
      };

    if (!sessions || sessions.length === 0) return [];

    const sessionIds = sessions.map((s) => s.id);
    const sessionDateById = new Map(sessions.map((s) => [s.id, s.scheduled_date]));

    // ── Fetch session exercises ───────────────────────────────────────────────
    // Paginate in chunks to avoid the 1000-row PostgREST cap.
    const sessionExercises: Array<{
      id: string;
      session_id: string;
      exercise_id: string | null;
      exercise_name_snapshot: string;
    }> = [];

    for (let i = 0; i < sessionIds.length; i += 100) {
      const chunk = sessionIds.slice(i, i + 100);
      const { data: seRows } = await fromUntyped(supabase, 'helm_lifting_session_exercises')
        .select('id, session_id, exercise_id, exercise_name_snapshot')
        .in('session_id', chunk)
        .eq('status', 'completed') as {
          data: Array<{
            id: string;
            session_id: string;
            exercise_id: string | null;
            exercise_name_snapshot: string;
          }> | null;
        };
      sessionExercises.push(...(seRows ?? []));
    }

    if (sessionExercises.length === 0) return [];

    const seIds = sessionExercises.map((se) => se.id);

    // ── Fetch set results ─────────────────────────────────────────────────────
    const allSets: Array<{
      session_exercise_id: string;
      set_number: number;
      actual_load: number | null;
      actual_reps: number | null;
      rpe: number | null;
    }> = [];

    for (let i = 0; i < seIds.length; i += 100) {
      const chunk = seIds.slice(i, i + 100);
      const { data: setRows } = await fromUntyped(supabase, 'helm_lifting_set_results')
        .select('session_exercise_id, set_number, actual_load, actual_reps, rpe')
        .in('session_exercise_id', chunk)
        .order('set_number', { ascending: true }) as {
          data: Array<{
            session_exercise_id: string;
            set_number: number;
            actual_load: number | null;
            actual_reps: number | null;
            rpe: number | null;
          }> | null;
        };
      allSets.push(...(setRows ?? []));
    }

    // ── Fetch PRs for this athlete ────────────────────────────────────────────
    const { data: prRows } = await fromUntyped(supabase, 'helm_lifting_prs')
      .select('exercise_id, pr_type, value, unit, achieved_at')
      .eq('athlete_id', athleteId)
      .gte('achieved_at', dateFrom)
      .lte('achieved_at', dateTo) as {
        data: Array<{
          exercise_id: string;
          pr_type: string;
          value: number;
          unit: string;
          achieved_at: string;
        }> | null;
      };

    // ── Build per-exercise progression data ───────────────────────────────────
    // Group set results by session_exercise → exercise
    type ExerciseKey = string; // exercise_id or fallback name-slug

    interface AccumulatedExercise {
      exercise_id: string;
      exercise_name: string;
      topSetsRaw: Array<{
        sessionDate: string;
        sessionExerciseId: string;
        sets: typeof allSets;
      }>;
      prMarkers: ExercisePRMarker[];
    }

    const exerciseMap = new Map<ExerciseKey, AccumulatedExercise>();

    // Group sets by session_exercise_id
    const setsBySeId = new Map<string, typeof allSets>();
    for (const s of allSets) {
      const arr = setsBySeId.get(s.session_exercise_id) ?? [];
      arr.push(s);
      setsBySeId.set(s.session_exercise_id, arr);
    }

    for (const se of sessionExercises) {
      const sessionDate = sessionDateById.get(se.session_id);
      if (!sessionDate) continue;

      // Use exercise_id as key when present, else use the name snapshot slug
      const key: ExerciseKey =
        se.exercise_id ?? se.exercise_name_snapshot.toLowerCase().replace(/\s+/g, '_');

      if (!exerciseMap.has(key)) {
        exerciseMap.set(key, {
          exercise_id: se.exercise_id ?? key,
          exercise_name: se.exercise_name_snapshot,
          topSetsRaw: [],
          prMarkers: [],
        });
      }

      const acc = exerciseMap.get(key)!;
      acc.topSetsRaw.push({
        sessionDate,
        sessionExerciseId: se.id,
        sets: setsBySeId.get(se.id) ?? [],
      });
    }

    // Attach PR markers
    for (const pr of prRows ?? []) {
      const key = pr.exercise_id;
      const acc = exerciseMap.get(key);
      if (acc) {
        acc.prMarkers.push({
          pr_type: pr.pr_type as HelmLiftingPrType,
          value: pr.value,
          unit: pr.unit,
          achieved_at: pr.achieved_at,
        });
      }
    }

    // ── Shape output ──────────────────────────────────────────────────────────
    const result: ExerciseProgression[] = [];

    for (const acc of exerciseMap.values()) {
      if (result.length >= maxExercises) break;

      const topSets: ExerciseTopSet[] = [];
      const weeklyVolume: Record<string, number> = {};

      // Sort session-exercise appearances ascending by date
      acc.topSetsRaw.sort((a, b) => a.sessionDate.localeCompare(b.sessionDate));

      for (const seDay of acc.topSetsRaw) {
        const { sessionDate, sets } = seDay;

        if (sets.length === 0) continue;

        // Top set = highest actual_load (or highest est1RM when loads equal)
        const setsWithLoad = sets.filter((s) => s.actual_load != null && s.actual_load > 0);
        const topSet =
          setsWithLoad.length > 0
            ? setsWithLoad.reduce((best, s) => {
                const bestE = epley1RM(best.actual_load ?? 0, best.actual_reps ?? 1) ?? 0;
                const sE = epley1RM(s.actual_load ?? 0, s.actual_reps ?? 1) ?? 0;
                return sE > bestE ? s : best;
              })
            : sets[0];

        if (!topSet) continue;

        const est1RM =
          topSet.actual_load != null && topSet.actual_reps != null
            ? epley1RM(topSet.actual_load, topSet.actual_reps)
            : null;

        topSets.push({
          sessionDate,
          loadLbs: topSet.actual_load,
          actualReps: topSet.actual_reps,
          rpe: topSet.rpe,
          est1RM,
        });

        // Weekly volume: sum(load × reps) for all sets that have both
        const weekKey = isoWeekStart(sessionDate);
        let weekVol = weeklyVolume[weekKey] ?? 0;
        for (const s of sets) {
          if (s.actual_load != null && s.actual_reps != null) {
            weekVol += s.actual_load * s.actual_reps;
          }
        }
        weeklyVolume[weekKey] = Math.round(weekVol);
      }

      if (topSets.length === 0) continue; // skip exercises with no logged sets

      result.push({
        exercise_id: acc.exercise_id,
        exercise_name: acc.exercise_name,
        topSets,
        weeklyVolume,
        prMarkers: acc.prMarkers.sort((a, b) =>
          a.achieved_at.localeCompare(b.achieved_at),
        ),
      });
    }

    // Sort by exercise name for deterministic, coach-friendly ordering
    result.sort((a, b) => a.exercise_name.localeCompare(b.exercise_name));
    return result;
  },
);

// =============================================================================
// getPlayerPerformanceCompliance
// =============================================================================

/** Compliance rate for one check-in type, over the requested window. */
export interface ComplianceRate {
  /** Total requests generated in the window. */
  total: number;
  /** Requests marked completed (or ready_to_go for soreness). */
  completed: number;
  /** Requests marked missed. */
  missed: number;
  /** Requests still pending (not yet due or overdue). */
  pending: number;
  /** Completion rate 0–100 (null when total === 0). */
  completionPct: number | null;
}

export interface PlayerPerformanceCompliance {
  athlete: ProfileAthlete;
  /** ISO start date of the window queried. */
  windowFrom: string;
  /** ISO end date of the window queried. */
  windowTo: string;

  /** Scheduled lift sessions (completed / missed / assigned). */
  liftCompliance: ComplianceRate;
  /** Scheduled soreness check-in requests. */
  sorenessCompliance: ComplianceRate;
  /** Scheduled weight check-in requests. */
  weightCompliance: ComplianceRate;
  /**
   * Readiness check-in completion (athlete submitted any readiness form).
   * Denominator = calendar days in the window (sparse measure).
   * Numerator = distinct days with a readiness check-in submitted.
   */
  readinessCompliance: ComplianceRate;
}

const performanceComplianceSchema = z.object({
  orgId: uuid,
  athleteId: uuid.optional().nullable(),
  /** Window start (YYYY-MM-DD). Default: 30 days ago. */
  dateFrom: ymd.optional().nullable(),
  /** Window end (YYYY-MM-DD). Default: today. */
  dateTo: ymd.optional().nullable(),
});

/** Count calendar days between two YYYY-MM-DD strings (inclusive). */
function countDays(from: string, to: string): number {
  const msPerDay = 86_400_000;
  const a = new Date(`${from}T00:00:00Z`);
  const b = new Date(`${to}T00:00:00Z`);
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / msPerDay) + 1);
}

function buildComplianceRate(
  rows: Array<{ status: string }>,
  completedStatuses: string[],
): ComplianceRate {
  const total = rows.length;
  const completed = rows.filter((r) => completedStatuses.includes(r.status)).length;
  const missed = rows.filter((r) => r.status === 'missed').length;
  const pending = rows.filter((r) => r.status === 'pending').length;
  const completionPct =
    total > 0 ? Math.round((completed / total) * 100) : null;
  return { total, completed, missed, pending, completionPct };
}

export const getPlayerPerformanceCompliance = withLiftingAction(
  'getPlayerPerformanceCompliance',
  {
    featureArea: 'lifting-performance-profile',
    requireEdit: false,
    orgFrom: (...args) => (args[0] as { orgId?: string })?.orgId,
  },
  async (
    ctx,
    raw: z.input<typeof performanceComplianceSchema>,
  ): Promise<PlayerPerformanceCompliance> => {
    const input = performanceComplianceSchema.parse(raw);
    const supabase = await createClient();

    // ── Resolve athlete ───────────────────────────────────────────────────────
    let athleteId = input.athleteId ?? null;
    if (!athleteId) {
      athleteId = await resolveSelfAthleteId(supabase, ctx.orgId, ctx.user.id);
      if (!athleteId) throw new LiftingActionError('No athlete profile found for this user.');
    }

    const { data: athleteRow } = await fromUntyped(supabase, 'helm_lifting_athletes')
      .select('id, first_name, last_name, position, sport')
      .eq('id', athleteId)
      .eq('organization_id', ctx.orgId)
      .maybeSingle() as {
        data: {
          id: string;
          first_name: string | null;
          last_name: string | null;
          position: string | null;
          sport: string;
        } | null;
      };

    if (!athleteRow) throw new LiftingActionError('Athlete not found in this org.');

    const athlete: ProfileAthlete = {
      id: athleteRow.id,
      first_name: athleteRow.first_name,
      last_name: athleteRow.last_name,
      position: athleteRow.position,
      sport: athleteRow.sport as 'baseball' | 'golf',
    };

    const referenceDate = today();
    const windowFrom = input.dateFrom ?? daysAgo(referenceDate, 30);
    const windowTo = input.dateTo ?? referenceDate;

    // ── Lift compliance ───────────────────────────────────────────────────────
    const { data: sessionRows } = await fromUntyped(supabase, 'helm_lifting_sessions')
      .select('status')
      .eq('athlete_id', athleteId)
      .gte('scheduled_date', windowFrom)
      .lte('scheduled_date', windowTo) as {
        data: Array<{ status: string }> | null;
      };

    const liftCompliance = buildComplianceRate(sessionRows ?? [], ['completed', 'modified']);

    // ── Soreness check compliance ─────────────────────────────────────────────
    const { data: sorenessRequestRows } = await fromUntyped(
      supabase,
      'helm_lifting_soreness_check_requests',
    )
      .select('status')
      .eq('athlete_id', athleteId)
      .gte('due_date', windowFrom)
      .lte('due_date', windowTo) as {
        data: Array<{ status: SorenessCheckinStatus }> | null;
      };

    // Both 'completed' and 'ready_to_go' count as completed for soreness
    const sorenessCompliance = buildComplianceRate(sorenessRequestRows ?? [], [
      'completed',
      'ready_to_go',
    ]);

    // ── Weight check compliance ───────────────────────────────────────────────
    const { data: weightRequestRows } = await fromUntyped(
      supabase,
      'helm_lifting_weight_checkin_requests',
    )
      .select('status')
      .eq('athlete_id', athleteId)
      .gte('due_date', windowFrom)
      .lte('due_date', windowTo) as {
        data: Array<{ status: WeightCheckinStatus }> | null;
      };

    const weightCompliance = buildComplianceRate(weightRequestRows ?? [], ['completed']);

    // ── Readiness check-in compliance ─────────────────────────────────────────
    // Sparse measure: denominator = calendar days in window; numerator = distinct
    // days with a submitted readiness check-in. This reflects habit consistency.
    const { data: checkinRows } = await fromUntyped(supabase, 'helm_lifting_readiness_checkins')
      .select('checkin_date')
      .eq('athlete_id', athleteId)
      .gte('checkin_date', windowFrom)
      .lte('checkin_date', windowTo) as {
        data: Array<{ checkin_date: string }> | null;
      };

    const totalDays = countDays(windowFrom, windowTo);
    const distinctCheckinDays = new Set((checkinRows ?? []).map((r) => r.checkin_date)).size;
    const readinessCompliance: ComplianceRate = {
      total: totalDays,
      completed: distinctCheckinDays,
      missed: Math.max(0, totalDays - distinctCheckinDays),
      pending: 0, // point-in-time snapshot; future days not tracked here
      completionPct:
        totalDays > 0 ? Math.round((distinctCheckinDays / totalDays) * 100) : null,
    };

    return {
      athlete,
      windowFrom,
      windowTo,
      liftCompliance,
      sorenessCompliance,
      weightCompliance,
      readinessCompliance,
    };
  },
);
