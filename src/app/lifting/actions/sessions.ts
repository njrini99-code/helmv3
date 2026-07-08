'use server';

// =============================================================================
// src/app/lifting/actions/sessions.ts
//
// Helm Lifting Lab — session lifecycle + set logging. Covers:
//   listSessions           — paginated session list for the sessions page
//   advanceSessionLifecycle — assigned→started→completed / missed / excused
//   addSessionNote         — coach or athlete note on a session
//   modifySectionForAthlete — substitute an exercise or adjust load for one
//                             athlete's session_exercise (staff-only)
//   logSetResult           — athlete-self or staff set logging
//
// All mutations wrap in withLiftingAction. Player-self paths (logSetResult,
// submitReadinessCheckin) do NOT set requireEdit:true — the RLS athlete-self
// policies enforce athlete ownership; only staff edits of other athletes'
// sessions use requireEdit.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { withLiftingAction, LiftingActionError } from '@/lib/lifting/with-lifting-action';
import type {
  HelmLiftingSessionStatus,
  HelmLiftingSessionReviewStatus,
  HelmLiftingSetResultInsert,
  HelmLiftingSessionWithExercises,
  HelmLiftingSessionRow,
  HelmLiftingSessionExerciseRow,
  HelmLiftingSetResultRow,
} from '@/lib/types/helm-lifting-data';

const SESSIONS_PATH = '/lifting/dashboard/sessions';
const LIVE_PATH = '/lifting/dashboard/sessions/live';

// Baseball Wave C renders the staff live-room read at
// /baseball/dashboard/performance/live and the per-session player detail at
// /baseball/dashboard/lift/[sessionId] (mirroring the pattern in
// programs.ts / groups.ts) — bust both alongside the lifting-portal paths so
// a staff edit here doesn't leave the baseball portal serving stale session
// state. The bracket-pattern + 'page' type revalidates every session id in
// one call (same convention as revalidatePath('/golf/dashboard/rounds/[id]/
// review', 'page') in golf/actions/round-reviews.ts) — cheaper and safer
// than resolving one id per mutation site, several of which only have the
// session_exercise's parent session_id in scope, not a bound `sessionId`.
const BASEBALL_LIVE_PATH = '/baseball/dashboard/performance/live';
const BASEBALL_LIFT_PATH = '/baseball/dashboard/lift';
const BASEBALL_LIFT_SESSION_PATH = '/baseball/dashboard/lift/[sessionId]';

// -----------------------------------------------------------------------------
// Shared result
// -----------------------------------------------------------------------------

export interface SessionActionResult {
  success: boolean;
  id?: string;
  error?: string;
}

// -----------------------------------------------------------------------------
// Validation schemas
// -----------------------------------------------------------------------------

const uuid = z.string().uuid();

const listSessionsSchema = z.object({
  orgId: uuid.optional().nullable(),
  sport: z.enum(['baseball', 'golf']).optional().nullable(),
  athleteId: uuid.optional().nullable(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  status: z.enum(['assigned', 'started', 'completed', 'missed', 'excused', 'modified']).optional().nullable(),
  limit: z.number().int().min(1).max(200).optional(),
  cursor: z.string().optional().nullable(),
});

const lifecycleSchema = z.object({
  orgId: uuid.optional(),
  sessionId: uuid,
  newStatus: z.enum(['started', 'completed', 'missed', 'excused', 'modified']),
  reviewStatus: z.enum(['none', 'needs_review', 'reviewed']).optional().nullable(),
});

const addNoteSchema = z.object({
  orgId: uuid.optional(),
  sessionId: uuid,
  note: z.string().trim().max(2000),
  /** 'coach' note replaces the coach_note field; 'player' replaces player_note */
  noteType: z.enum(['coach', 'player']),
});

const modifySectionSchema = z.object({
  orgId: uuid.optional(),
  sessionExerciseId: uuid,
  newExerciseId: uuid.optional().nullable(),
  newExerciseName: z.string().trim().max(160).optional().nullable(),
  newLoad: z.number().min(0).max(2000).optional().nullable(),
  newLoadUnit: z.string().max(20).optional().nullable(),
  modificationReason: z.string().trim().max(1000).optional().nullable(),
});

const logSetSchema = z.object({
  orgId: uuid.optional(),
  sessionExerciseId: uuid,
  athleteId: uuid,
  setNumber: z.number().int().min(1).max(50),
  actualReps: z.number().int().min(0).max(500).optional().nullable(),
  actualLoad: z.number().min(0).max(2000).optional().nullable(),
  loadUnit: z.string().max(20).optional().nullable(),
  rpe: z.number().min(0).max(10).optional().nullable(),
  rir: z.number().int().min(0).max(10).optional().nullable(),
  velocity: z.number().min(0).max(30).optional().nullable(),
  playerNote: z.string().trim().max(500).optional().nullable(),
  completedAt: z.string().datetime().optional().nullable(),
});

// -----------------------------------------------------------------------------
// 1. listSessions
// -----------------------------------------------------------------------------

export interface SessionListItem extends HelmLiftingSessionRow {
  athlete_first_name: string | null;
  athlete_last_name: string | null;
  athlete_position: string | null;
}

export const listSessions = withLiftingAction(
  'listSessions',
  {
    featureArea: 'lifting-sessions',
    requireEdit: false,
    orgFrom: (...args) => (args[0] as { orgId?: string })?.orgId,
  },
  async (ctx, raw: z.input<typeof listSessionsSchema>): Promise<SessionListItem[]> => {
    const input = listSessionsSchema.parse(raw);
    const supabase = await createClient();
    const limit = input.limit ?? 50;

    // Build query
    let query = fromUntyped(supabase, 'helm_lifting_sessions')
      .select('*')
      .eq('organization_id', ctx.orgId)
      .order('scheduled_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (input.sport) query = query.eq('sport', input.sport);
    if (input.athleteId) query = query.eq('athlete_id', input.athleteId);
    if (input.status) query = query.eq('status', input.status);
    if (input.dateFrom) query = query.gte('scheduled_date', input.dateFrom);
    if (input.dateTo) query = query.lte('scheduled_date', input.dateTo);
    if (input.cursor) query = query.lt('scheduled_date', input.cursor);

    const { data: sessions, error } = await query as {
      data: HelmLiftingSessionRow[] | null;
      error: unknown;
    };
    if (error) throw error;

    if (!sessions || sessions.length === 0) return [];

    // Batch-load athlete names.
    const athleteIds = [...new Set(sessions.map((s) => s.athlete_id))];
    const { data: athletes } = await fromUntyped(supabase, 'helm_lifting_athletes')
      .select('id, first_name, last_name, position')
      .in('id', athleteIds) as {
        data: Array<{
          id: string; first_name: string | null;
          last_name: string | null; position: string | null;
        }> | null
      };

    const athleteMap = new Map((athletes ?? []).map((a) => [a.id, a]));

    return sessions.map((s) => {
      const athlete = athleteMap.get(s.athlete_id);
      return {
        ...s,
        athlete_first_name: athlete?.first_name ?? null,
        athlete_last_name: athlete?.last_name ?? null,
        athlete_position: athlete?.position ?? null,
      };
    });
  },
);

// -----------------------------------------------------------------------------
// 2. advanceSessionLifecycle
// -----------------------------------------------------------------------------

export const advanceSessionLifecycle = withLiftingAction(
  'advanceSessionLifecycle',
  {
    featureArea: 'lifting-sessions',
    requireEdit: true,
    orgFrom: (...args) => (args[0] as { orgId?: string })?.orgId,
  },
  async (ctx, raw: z.input<typeof lifecycleSchema>): Promise<SessionActionResult> => {
    const { sessionId, newStatus, reviewStatus } = lifecycleSchema.parse(raw);
    const supabase = await createClient();

    // Verify session belongs to this org.
    const { data: session } = await fromUntyped(supabase, 'helm_lifting_sessions')
      .select('id, organization_id, status')
      .eq('id', sessionId)
      .eq('organization_id', ctx.orgId)
      .maybeSingle() as { data: { id: string; organization_id: string; status: string } | null };

    if (!session) throw new LiftingActionError('Session not found.');

    const now = new Date().toISOString();
    const update: Record<string, unknown> = {
      status: newStatus as HelmLiftingSessionStatus,
      updated_at: now,
    };
    if (newStatus === 'started' && session.status === 'assigned') {
      update.started_at = now;
    }
    if (newStatus === 'completed') {
      update.completed_at = now;
    }
    if (reviewStatus !== undefined && reviewStatus !== null) {
      update.coach_review_status = reviewStatus as HelmLiftingSessionReviewStatus;
    }

    const { error } = await fromUntyped(supabase, 'helm_lifting_sessions')
      .update(update)
      .eq('id', sessionId)
      .eq('organization_id', ctx.orgId);

    if (error) throw error;
    revalidatePath(SESSIONS_PATH);
    revalidatePath(LIVE_PATH);
    revalidatePath(BASEBALL_LIVE_PATH);
    revalidatePath(BASEBALL_LIFT_PATH);
    revalidatePath(BASEBALL_LIFT_SESSION_PATH, 'page');
    return { success: true, id: sessionId };
  },
);

// -----------------------------------------------------------------------------
// 3. addSessionNote
// -----------------------------------------------------------------------------

export const addSessionNote = withLiftingAction(
  'addSessionNote',
  {
    featureArea: 'lifting-sessions',
    requireEdit: false, // Athletes can add player_note on their own session
    orgFrom: (...args) => (args[0] as { orgId?: string })?.orgId,
  },
  async (ctx, raw: z.input<typeof addNoteSchema>): Promise<SessionActionResult> => {
    const { sessionId, note, noteType } = addNoteSchema.parse(raw);
    const supabase = await createClient();

    // Verify org scope.
    const { data: session } = await fromUntyped(supabase, 'helm_lifting_sessions')
      .select('id, organization_id, athlete_id')
      .eq('id', sessionId)
      .eq('organization_id', ctx.orgId)
      .maybeSingle() as { data: { id: string; organization_id: string; athlete_id: string } | null };

    if (!session) throw new LiftingActionError('Session not found.');

    // For coach notes, require canEdit.
    if (noteType === 'coach' && !ctx.access.canEdit) {
      throw new LiftingActionError('Only coaches with edit access can add coach notes.');
    }

    const field = noteType === 'coach' ? 'coach_note' : 'player_note';
    const { error } = await fromUntyped(supabase, 'helm_lifting_sessions')
      .update({ [field]: note, updated_at: new Date().toISOString() })
      .eq('id', sessionId)
      .eq('organization_id', ctx.orgId);

    if (error) throw error;
    revalidatePath(SESSIONS_PATH);
    revalidatePath(BASEBALL_LIVE_PATH);
    revalidatePath(BASEBALL_LIFT_PATH);
    revalidatePath(BASEBALL_LIFT_SESSION_PATH, 'page');
    return { success: true, id: sessionId };
  },
);

// -----------------------------------------------------------------------------
// 4. modifySectionForAthlete — staff substitute or adjust a session exercise
// -----------------------------------------------------------------------------

export const modifySectionForAthlete = withLiftingAction(
  'modifySectionForAthlete',
  {
    featureArea: 'lifting-sessions',
    requireEdit: true,
    orgFrom: (...args) => (args[0] as { orgId?: string })?.orgId,
  },
  async (ctx, raw: z.input<typeof modifySectionSchema>): Promise<SessionActionResult> => {
    const input = modifySectionSchema.parse(raw);
    const supabase = await createClient();

    // Verify the session_exercise is in this org's scope via its session.
    const { data: se } = await fromUntyped(supabase, 'helm_lifting_session_exercises')
      .select('id, session_id')
      .eq('id', input.sessionExerciseId)
      .maybeSingle() as { data: { id: string; session_id: string } | null };

    if (!se) throw new LiftingActionError('Session exercise not found.');

    const { data: session } = await fromUntyped(supabase, 'helm_lifting_sessions')
      .select('organization_id')
      .eq('id', se.session_id)
      .eq('organization_id', ctx.orgId)
      .maybeSingle() as { data: { organization_id: string } | null };

    if (!session) throw new LiftingActionError('Session not accessible.');

    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      modified_by_coach_id: ctx.access.coachRow?.id ?? null,
      modification_reason: input.modificationReason ?? null,
    };

    if (input.newExerciseId !== undefined) update.exercise_id = input.newExerciseId;
    if (input.newExerciseName !== undefined) update.exercise_name_snapshot = input.newExerciseName;
    if (input.newLoad !== undefined) update.prescribed_load = input.newLoad;
    if (input.newLoadUnit !== undefined) update.prescribed_load_unit = input.newLoadUnit;

    const { error } = await fromUntyped(supabase, 'helm_lifting_session_exercises')
      .update(update)
      .eq('id', input.sessionExerciseId);

    if (error) throw error;

    // Mark session as modified.
    await fromUntyped(supabase, 'helm_lifting_sessions')
      .update({ status: 'modified', updated_at: new Date().toISOString() })
      .eq('id', se.session_id)
      .eq('organization_id', ctx.orgId);

    revalidatePath(LIVE_PATH);
    revalidatePath(BASEBALL_LIVE_PATH);
    revalidatePath(BASEBALL_LIFT_PATH);
    revalidatePath(BASEBALL_LIFT_SESSION_PATH, 'page');
    return { success: true, id: input.sessionExerciseId };
  },
);

// -----------------------------------------------------------------------------
// 5. logSetResult — athlete-self or staff set logging
// -----------------------------------------------------------------------------

export const logSetResult = withLiftingAction(
  'logSetResult',
  {
    featureArea: 'lifting-sessions',
    requireEdit: false, // RLS athlete-self policy enforces ownership
    orgFrom: (...args) => (args[0] as { orgId?: string })?.orgId,
  },
  async (ctx, raw: z.input<typeof logSetSchema>): Promise<SessionActionResult> => {
    const input = logSetSchema.parse(raw);
    const supabase = await createClient();

    // Resolve the session exercise + verify org scope.
    const { data: se } = await fromUntyped(supabase, 'helm_lifting_session_exercises')
      .select('id, session_id, exercise_id, prescribed_sets, prescribed_reps, prescribed_load, prescribed_load_unit, prescribed_rpe')
      .eq('id', input.sessionExerciseId)
      .maybeSingle() as {
        data: {
          id: string; session_id: string; exercise_id: string | null;
          prescribed_sets: number | null; prescribed_reps: number | null;
          prescribed_load: number | null; prescribed_load_unit: string | null;
          prescribed_rpe: number | null;
        } | null
      };

    if (!se) throw new LiftingActionError('Session exercise not found.');

    const { data: session } = await fromUntyped(supabase, 'helm_lifting_sessions')
      .select('organization_id, sport')
      .eq('id', se.session_id)
      .eq('organization_id', ctx.orgId)
      .maybeSingle() as { data: { organization_id: string; sport: string } | null };

    if (!session) throw new LiftingActionError('Session not accessible.');

    const payload: HelmLiftingSetResultInsert = {
      session_exercise_id: input.sessionExerciseId,
      organization_id: ctx.orgId,
      sport: session.sport as 'baseball' | 'golf',
      athlete_id: input.athleteId,
      set_number: input.setNumber,
      prescribed_reps: se.prescribed_reps ?? null,
      actual_reps: input.actualReps ?? null,
      prescribed_load: se.prescribed_load ?? null,
      actual_load: input.actualLoad ?? null,
      load_unit: input.loadUnit ?? se.prescribed_load_unit ?? null,
      rpe: input.rpe ?? null,
      rir: input.rir ?? null,
      velocity: input.velocity ?? null,
      completed_at: input.completedAt ?? new Date().toISOString(),
      player_note: input.playerNote ?? null,
      coach_observed: ctx.access.isCoach,
    };

    // Upsert on (session_exercise_id, set_number) — the only unique
    // constraint on helm_lifting_set_results (uq_helm_lifting_set; verified
    // via pg_constraint). A 3-column onConflict including athlete_id matches
    // no constraint and Postgres rejects it with 42P10 on every call.
    const { data, error } = await fromUntyped(supabase, 'helm_lifting_set_results')
      .upsert(payload, { onConflict: 'session_exercise_id,set_number' })
      .select('id')
      .single();

    if (error) throw error;

    // Advance session to started if it's still assigned.
    await fromUntyped(supabase, 'helm_lifting_sessions')
      .update({ status: 'started', started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', se.session_id)
      .eq('status', 'assigned');

    revalidatePath(LIVE_PATH);
    revalidatePath(BASEBALL_LIVE_PATH);
    revalidatePath(BASEBALL_LIFT_PATH);
    revalidatePath(BASEBALL_LIFT_SESSION_PATH, 'page');
    return { success: true, id: (data as { id: string }).id };
  },
);

// -----------------------------------------------------------------------------
// 6. getSessionWithExercises — full session detail for the live room / player view
// -----------------------------------------------------------------------------

export const getSessionWithExercises = withLiftingAction(
  'getSessionWithExercises',
  {
    featureArea: 'lifting-sessions',
    requireEdit: false,
    orgFrom: (...args) => (args[0] as { orgId?: string })?.orgId,
  },
  async (ctx, sessionId: string): Promise<HelmLiftingSessionWithExercises | null> => {
    const supabase = await createClient();

    const { data: session } = await fromUntyped(supabase, 'helm_lifting_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('organization_id', ctx.orgId)
      .maybeSingle() as { data: HelmLiftingSessionRow | null };

    if (!session) return null;

    const { data: exercises } = await fromUntyped(supabase, 'helm_lifting_session_exercises')
      .select('*')
      .eq('session_id', sessionId)
      .order('order_index', { ascending: true }) as { data: HelmLiftingSessionExerciseRow[] | null };

    const seRows = exercises ?? [];

    if (seRows.length === 0) {
      return { ...session, exercises: [] };
    }

    const { data: setResults } = await fromUntyped(supabase, 'helm_lifting_set_results')
      .select('*')
      .in('session_exercise_id', seRows.map((e) => e.id))
      .order('set_number', { ascending: true }) as { data: HelmLiftingSetResultRow[] | null };

    const setsByExercise = new Map<string, HelmLiftingSetResultRow[]>();
    for (const sr of setResults ?? []) {
      const arr = setsByExercise.get(sr.session_exercise_id) ?? [];
      arr.push(sr);
      setsByExercise.set(sr.session_exercise_id, arr);
    }

    return {
      ...session,
      exercises: seRows.map((e) => ({
        ...e,
        sets: setsByExercise.get(e.id) ?? [],
      })),
    };
  },
);
