'use server';

// =============================================================================
// src/app/lifting/actions/player-sessions.ts
//
// Athlete-self server actions for the Lifting Lab session execution surface.
// RLS policy helm_lifting_is_my_athlete enforces athlete ownership.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { resolveMyBaseballAthleteId } from '@/lib/lifting/resolve-baseball-context';

// Baseball Wave C renders these same helm_lifting_sessions /
// helm_lifting_readiness_checkins reads at /baseball/dashboard/lift and
// /baseball/dashboard/lift/[sessionId] (see src/app/baseball/(dashboard)/
// dashboard/lift/page.tsx + [sessionId]/page.tsx) — bust both alongside
// '/lifting/dashboard/lift' below so a baseball athlete's own lift portal
// reflects a checkin/set/status mutation immediately.
const BASEBALL_LIFT_PATH = '/baseball/dashboard/lift';
import type {
  HelmLiftingSessionRow,
  HelmLiftingSessionStatus,
  HelmLiftingReadinessCheckinRow,
  HelmLiftingSetResultInsert,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// getMyLiftToday — fetches today's + overdue open sessions + today's checkin
// ---------------------------------------------------------------------------

export async function getMyLiftToday(): Promise<{
  success: boolean;
  sessions: HelmLiftingSessionRow[];
  checkin: HelmLiftingReadinessCheckinRow | null;
  error?: string;
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, sessions: [], checkin: null, error: 'Not authenticated.' };

  // Resolve athlete id — try all orgs the user belongs to
  // First try baseball player -> org
  let athleteId: string | null = null;

  const { data: baseballPlayerRow } = await fromUntyped(supabase, 'baseball_players')
    .select('id, baseball_teams(organization_id)')
    .eq('user_id', user.id)
    .maybeSingle() as { data: { id: string; baseball_teams?: { organization_id?: string } | null } | null };

  if (baseballPlayerRow) {
    const orgId = baseballPlayerRow.baseball_teams?.organization_id ?? null;
    if (orgId) {
      athleteId = await resolveMyBaseballAthleteId(orgId);
    }
  }

  // Try golf player -> org
  if (!athleteId) {
    const { data: golfPlayerRow } = await fromUntyped(supabase, 'golf_players')
      .select('id, golf_team_members(golf_teams(organization_id))')
      .eq('user_id', user.id)
      .maybeSingle() as {
      data: {
        id: string;
        golf_team_members?: Array<{ golf_teams?: { organization_id?: string } | null }> | null;
      } | null;
    };

    if (golfPlayerRow) {
      const orgId =
        golfPlayerRow.golf_team_members?.[0]?.golf_teams?.organization_id ?? null;
      if (orgId) {
        const { data: golfAthleteRow } = await fromUntyped(supabase, 'helm_lifting_athletes')
          .select('id')
          .eq('organization_id', orgId)
          .eq('sport', 'golf')
          .eq('sport_player_id', golfPlayerRow.id)
          .eq('is_active', true)
          .maybeSingle() as { data: { id: string } | null };
        athleteId = golfAthleteRow?.id ?? null;
      }
    }
  }

  // Fall back: look up helm_lifting_athletes directly by user_id
  if (!athleteId) {
    const { data: athleteRow } = await fromUntyped(supabase, 'helm_lifting_athletes')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle() as { data: { id: string } | null };
    athleteId = athleteRow?.id ?? null;
  }

  if (!athleteId) {
    return { success: true, sessions: [], checkin: null };
  }

  const today = new Date().toISOString().slice(0, 10);
  const OPEN: HelmLiftingSessionStatus[] = ['assigned', 'started', 'modified'];

  // Fetch today's sessions + overdue open sessions
  const { data: sessions, error: sessErr } = await fromUntyped(supabase, 'helm_lifting_sessions')
    .select('*')
    .eq('athlete_id', athleteId)
    .or(`scheduled_date.eq.${today},and(status.in.(assigned,started,modified),scheduled_date.lt.${today})`)
    .order('scheduled_date', { ascending: true }) as {
    data: HelmLiftingSessionRow[] | null;
    error: unknown;
  };

  if (sessErr) {
    return { success: false, sessions: [], checkin: null, error: 'Could not load sessions.' };
  }

  // Filter to open + today's completed
  const relevant = (sessions ?? []).filter(
    (s) => s.scheduled_date === today || OPEN.includes(s.status),
  );

  // Fetch today's readiness check-in
  const { data: checkinRow } = await fromUntyped(supabase, 'helm_lifting_readiness_checkins')
    .select('*')
    .eq('athlete_id', athleteId)
    .eq('checkin_date', today)
    .maybeSingle() as { data: HelmLiftingReadinessCheckinRow | null };

  return { success: true, sessions: relevant, checkin: checkinRow ?? null };
}

// ---------------------------------------------------------------------------
// submitLiftReadiness — upsert athlete's daily readiness check-in
// ---------------------------------------------------------------------------

export async function submitLiftReadiness(input: {
  sleepQuality: number | null;
  energyLevel: number | null;
  sorenessOverall: number | null;
  notes: string | null;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated.' };

  // Resolve athlete id
  const { data: athleteRow } = await fromUntyped(supabase, 'helm_lifting_athletes')
    .select('id, organization_id, sport')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle() as { data: { id: string; organization_id: string; sport: string } | null };
  if (!athleteRow) return { success: false, error: 'Athlete profile not found.' };

  const today = new Date().toISOString().slice(0, 10);

  // Upsert on (athlete_id, checkin_date) — the only unique constraint on
  // helm_lifting_readiness_checkins (uq_helm_lifting_checkin; verified via
  // pg_constraint). A 4-column onConflict matches no constraint and Postgres
  // rejects it with 42P10 on every call.
  const { data, error } = await fromUntyped(supabase, 'helm_lifting_readiness_checkins')
    .upsert(
      {
        organization_id: athleteRow.organization_id,
        sport: athleteRow.sport,
        athlete_id: athleteRow.id,
        checkin_date: today,
        sleep_quality: input.sleepQuality,
        energy_level: input.energyLevel,
        soreness_overall: input.sorenessOverall,
        notes: input.notes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'athlete_id,checkin_date' },
    )
    .select('id')
    .maybeSingle() as { data: { id: string } | null; error: unknown };

  if (error) return { success: false, error: 'Could not save check-in.' };
  revalidatePath('/lifting/dashboard');
  revalidatePath(BASEBALL_LIFT_PATH);
  return { success: true, id: data?.id };
}

// ---------------------------------------------------------------------------
// startMySession — transition a session from assigned → started
// ---------------------------------------------------------------------------

export async function startMySession(sessionId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated.' };

  const now = new Date().toISOString();
  const { error } = await fromUntyped(supabase, 'helm_lifting_sessions')
    .update({ status: 'started', started_at: now, updated_at: now })
    .eq('id', sessionId)
    .eq('status', 'assigned'); // Only transition from assigned → started

  if (error) return { success: false, error: 'Could not start session.' };
  revalidatePath('/lifting/dashboard/lift');
  revalidatePath(BASEBALL_LIFT_PATH);
  revalidatePath(`${BASEBALL_LIFT_PATH}/${sessionId}`);
  return { success: true };
}

// ---------------------------------------------------------------------------
// logMySetResult — upsert a set result for the authenticated athlete
// ---------------------------------------------------------------------------

export async function logMySetResult(input: {
  sessionExerciseId: string;
  sessionId: string;
  athleteId: string;
  setNumber: number;
  actualReps: number | null;
  actualLoad: number | null;
  loadUnit: string | null;
  rpe: number | null;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated.' };

  // Look up session for org + sport context
  const { data: session } = await fromUntyped(supabase, 'helm_lifting_sessions')
    .select('organization_id, sport')
    .eq('id', input.sessionId)
    .maybeSingle() as { data: { organization_id: string; sport: string } | null };

  if (!session) return { success: false, error: 'Session not found.' };

  const payload: HelmLiftingSetResultInsert = {
    session_exercise_id: input.sessionExerciseId,
    organization_id: session.organization_id,
    sport: session.sport as 'baseball' | 'golf',
    athlete_id: input.athleteId,
    set_number: input.setNumber,
    actual_reps: input.actualReps,
    actual_load: input.actualLoad,
    load_unit: input.loadUnit,
    rpe: input.rpe,
    completed_at: new Date().toISOString(),
  };

  // Upsert on (session_exercise_id, set_number) — the only unique
  // constraint on helm_lifting_set_results (uq_helm_lifting_set; verified
  // via pg_constraint). A 3-column onConflict including athlete_id matches
  // no constraint and Postgres rejects it with 42P10 on every call.
  const { data, error } = await fromUntyped(supabase, 'helm_lifting_set_results')
    .upsert(payload, { onConflict: 'session_exercise_id,set_number' })
    .select('id')
    .maybeSingle() as { data: { id: string } | null; error: unknown };

  if (error) return { success: false, error: 'Could not save set.' };

  // Auto-advance to started if still assigned
  await fromUntyped(supabase, 'helm_lifting_sessions')
    .update({ status: 'started', started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', input.sessionId)
    .eq('status', 'assigned');

  revalidatePath('/lifting/dashboard/lift');
  revalidatePath(BASEBALL_LIFT_PATH);
  revalidatePath(`${BASEBALL_LIFT_PATH}/${input.sessionId}`);
  return { success: true, id: data?.id };
}

// ---------------------------------------------------------------------------
// completeMySession — mark a session as completed
// ---------------------------------------------------------------------------

export async function completeMySession(sessionId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated.' };

  const now = new Date().toISOString();
  const { error } = await fromUntyped(supabase, 'helm_lifting_sessions')
    .update({ status: 'completed', completed_at: now, updated_at: now })
    .eq('id', sessionId);

  if (error) return { success: false, error: 'Could not complete session.' };
  revalidatePath('/lifting/dashboard/lift');
  revalidatePath(BASEBALL_LIFT_PATH);
  revalidatePath(`${BASEBALL_LIFT_PATH}/${sessionId}`);
  return { success: true };
}
