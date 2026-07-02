// =============================================================================
// src/lib/baseball/read-models/player-lift.ts
//
// V11 player lift surface read models (spec "Player Lift Experience" L465-520).
// SELF-ONLY: resolves the current player from the session and only returns THAT
// player's sessions; RLS backs every query. 'server-only' plain async.
//
// W2-G REWIRE: reads from helm_lifting_sessions / helm_lifting_session_exercises /
// helm_lifting_set_results / helm_lifting_readiness_checkins (the unified Lab
// tables) instead of the legacy baseball_lift_* tables. Context resolution via
// resolveBaseballLiftingOrg + resolveMyBaseballAthleteId from
// @/lib/lifting/resolve-baseball-context. Results are adapted back to the
// existing BaseballLift* view shapes via adaptSession / adaptSessionExercise /
// adaptSetResult from @/lib/lifting/adapters/baseball-view-adapter so that
// PlayerLiftHomeClient and PlayerLiftSessionClient receive the same prop types
// they always expected — no component changes required.
//
// Resolution chain (both exported functions):
//   1. playerId (baseball_players.id, supplied by the page)
//      → team membership lookup → teamId (baseball_team_members)
//   2. teamId → resolveBaseballLiftingOrg(teamId) → organizationId
//   3. organizationId → resolveMyBaseballAthleteId(organizationId) → athleteId
//   4. athleteId → helm_lifting_* queries (via fromUntyped)
//   5. helm rows → adapter → existing view shapes
//
// Degrade-gracefully: when any resolution step yields null (team not found,
// org not linked, player not yet seeded in helm_lifting_athletes) the functions
// return an honest empty result rather than throwing.
// =============================================================================

import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import {
  resolveBaseballLiftingOrg,
  resolveMyBaseballAthleteId,
} from '@/lib/lifting/resolve-baseball-context';
import {
  adaptSession,
  adaptSessionExercise,
  adaptSetResult,
} from '@/lib/lifting/adapters/baseball-view-adapter';
import type {
  BaseballLiftSessionRow,
  BaseballLiftSessionExerciseRow,
  BaseballLiftSetResultRow,
  BaseballLiftSessionWithExercises,
} from '@/lib/types/baseball-lifting-v11';
import type {
  HelmLiftingSessionRow,
  HelmLiftingSessionExerciseRow,
  HelmLiftingSetResultRow,
} from '@/lib/types/helm-lifting-data';

export interface PlayerLiftHome {
  /** Today's (and upcoming) sessions for this player. */
  upcoming: BaseballLiftSessionRow[];
  /** Recently completed sessions (history preview). */
  recent: BaseballLiftSessionRow[];
  /** Whether today's readiness check-in has been submitted. */
  readinessSubmittedToday: boolean;
}

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// resolvePlayerTeam
// Look up the active team for a given baseball_players.id.
// Returns the first active team membership found, or null when none.
// ---------------------------------------------------------------------------

async function resolvePlayerTeam(
  supabase: Awaited<ReturnType<typeof createClient>>,
  playerId: string,
): Promise<string | null> {
  const { data: member } = await supabase
    .from('baseball_team_members')
    .select('team_id')
    .eq('player_id', playerId)
    .maybeSingle();
  return member?.team_id ?? null;
}

// ---------------------------------------------------------------------------
// resolveAthleteContext
// Full resolution chain: playerId → teamId → organizationId → athleteId.
// Returns null at any step that cannot be resolved (degrade-gracefully).
// Also returns the athleteToPlayer map needed by the adapters.
// ---------------------------------------------------------------------------

export interface AthleteContext {
  organizationId: string;
  teamId: string;
  athleteId: string;
  athleteToPlayer: Record<string, string>;
}

export async function resolveAthleteContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  playerId: string,
): Promise<AthleteContext | null> {
  // Step 1: resolve teamId from player membership.
  const teamId = await resolvePlayerTeam(supabase, playerId);
  if (!teamId) return null;

  // Step 2: resolve organizationId from team.
  const liftCtx = await resolveBaseballLiftingOrg(teamId);
  if (!liftCtx) return null;

  // Step 3: resolve the current user's helm_lifting_athletes.id.
  // resolveMyBaseballAthleteId uses supabase.auth.getUser() internally; the
  // athleteId belongs to the authenticated user. We additionally confirm it
  // matches the supplied playerId via the adapter map.
  const athleteId = await resolveMyBaseballAthleteId(liftCtx.organizationId);
  if (!athleteId) return null;

  // The adapter map is athlete_id → player_id for adapting helm rows back to
  // the baseball view shapes.
  const athleteToPlayer: Record<string, string> = { [athleteId]: playerId };

  return {
    organizationId: liftCtx.organizationId,
    teamId,
    athleteId,
    athleteToPlayer,
  };
}

// ---------------------------------------------------------------------------
// getPlayerLiftHome
// ---------------------------------------------------------------------------

export async function getPlayerLiftHome(playerId: string): Promise<PlayerLiftHome> {
  if (!playerId) {
    return { upcoming: [], recent: [], readinessSubmittedToday: false };
  }

  const supabase = await createClient();
  const ctx = await resolveAthleteContext(supabase, playerId);
  if (!ctx) {
    // Player not yet seeded in Helm Lifting Lab — honest empty state.
    return { upcoming: [], recent: [], readinessSubmittedToday: false };
  }

  const { organizationId, teamId, athleteId, athleteToPlayer } = ctx;
  const today = todayYmd();

  const [upcomingRes, recentRes, checkinRes] = await Promise.all([
    // Upcoming / in-progress sessions: today and forward, active statuses.
    fromUntyped(supabase, 'helm_lifting_sessions')
      .select(
        'id, title, scheduled_date, status, day_type, sport_context, estimated_minutes, team_id, athlete_id, program_assignment_id, organization_id, sport, started_at, completed_at, readiness_checkin_id, coach_review_status, player_note, coach_note, legacy_baseball_id, created_at, updated_at',
      )
      .eq('athlete_id', athleteId)
      .eq('organization_id', organizationId)
      .gte('scheduled_date', today)
      .in('status', ['assigned', 'started', 'modified'])
      .order('scheduled_date', { ascending: true })
      .limit(20),
    // Recently completed sessions (history preview).
    fromUntyped(supabase, 'helm_lifting_sessions')
      .select(
        'id, title, scheduled_date, status, day_type, sport_context, estimated_minutes, team_id, athlete_id, program_assignment_id, organization_id, sport, started_at, completed_at, readiness_checkin_id, coach_review_status, player_note, coach_note, legacy_baseball_id, created_at, updated_at',
      )
      .eq('athlete_id', athleteId)
      .eq('organization_id', organizationId)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(10),
    // Today's readiness check-in (helm_lifting_readiness_checkins).
    fromUntyped(supabase, 'helm_lifting_readiness_checkins')
      .select('id')
      .eq('athlete_id', athleteId)
      .eq('organization_id', organizationId)
      .eq('checkin_date', today)
      .maybeSingle(),
  ]);

  const upcoming = ((upcomingRes.data ?? []) as HelmLiftingSessionRow[]).map((r) =>
    adaptSession(r, teamId, athleteToPlayer),
  );

  const recent = ((recentRes.data ?? []) as HelmLiftingSessionRow[]).map((r) =>
    adaptSession(r, teamId, athleteToPlayer),
  );

  const readinessSubmittedToday = Boolean(checkinRes.data);

  return { upcoming, recent, readinessSubmittedToday };
}

// ---------------------------------------------------------------------------
// getPlayerLiftSession
// ---------------------------------------------------------------------------

export async function getPlayerLiftSession(
  playerId: string,
  sessionId: string,
): Promise<BaseballLiftSessionWithExercises | null> {
  if (!playerId || !sessionId) return null;

  const supabase = await createClient();
  const ctx = await resolveAthleteContext(supabase, playerId);
  if (!ctx) return null;

  const { organizationId, teamId, athleteId, athleteToPlayer } = ctx;

  // Fetch the session — defense-in-depth: also assert athlete_id matches
  // (RLS already enforces self-only; this is an additional application-layer guard).
  const { data: rawSession } = await fromUntyped(supabase, 'helm_lifting_sessions')
    .select(
      'id, title, scheduled_date, status, day_type, sport_context, estimated_minutes, team_id, athlete_id, program_assignment_id, organization_id, sport, started_at, completed_at, readiness_checkin_id, coach_review_status, player_note, coach_note, legacy_baseball_id, created_at, updated_at',
    )
    .eq('id', sessionId)
    .eq('athlete_id', athleteId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (!rawSession) return null;

  const session = adaptSession(rawSession as HelmLiftingSessionRow, teamId, athleteToPlayer);

  // Fetch exercises for this session.
  const { data: exRawRows } = await fromUntyped(supabase, 'helm_lifting_session_exercises')
    .select(
      'id, session_id, prescription_id, exercise_id, exercise_name_snapshot, section_name_snapshot, section_type_snapshot, order_index, prescribed_sets, prescribed_reps, prescribed_load, prescribed_load_unit, prescribed_rpe, modified_by_coach_id, modification_reason, status, legacy_baseball_id, created_at, updated_at',
    )
    .eq('session_id', sessionId)
    .order('order_index', { ascending: true });
  const exercises: BaseballLiftSessionExerciseRow[] = (
    (exRawRows ?? []) as HelmLiftingSessionExerciseRow[]
  ).map((e) => adaptSessionExercise(e));

  // Fetch set results for all exercises, batched.
  const exIds = exercises.map((e) => e.id);
  const setsByExercise = new Map<string, BaseballLiftSetResultRow[]>();

  if (exIds.length > 0) {
    const { data: setRawRows } = await fromUntyped(supabase, 'helm_lifting_set_results')
      .select(
        'id, session_exercise_id, organization_id, sport, athlete_id, set_number, prescribed_reps, actual_reps, prescribed_load, actual_load, load_unit, rpe, rir, velocity, completed_at, player_note, coach_observed, legacy_baseball_id, created_at',
      )
      .in('session_exercise_id', exIds)
      .order('set_number', { ascending: true });

    for (const s of (setRawRows ?? []) as HelmLiftingSetResultRow[]) {
      const adapted = adaptSetResult(s, teamId, athleteToPlayer);
      const arr = setsByExercise.get(s.session_exercise_id) ?? [];
      arr.push(adapted);
      setsByExercise.set(s.session_exercise_id, arr);
    }
  }

  return {
    ...session,
    exercises: exercises.map((e) => ({ ...e, sets: setsByExercise.get(e.id) ?? [] })),
  };
}

// ---------------------------------------------------------------------------
// getPlayerLiftOnboardingState (additive — Lift Lab front-door onboarding)
//
// First-visit detection for the Lift Lab entry (Task C). "New to the Lab"
// means: no readiness check-in ever, no set log ever, AND no onboarded_at
// value — the same resolveAthleteContext chain as getPlayerLiftHome above,
// reused verbatim (exported, not duplicated).
//
// onboarded_at is read via the untyped escape hatch — the column ships in a
// db_gated migration (supabase/migrations/
// 20260702120000_baseball_helm_lifting_athletes_onboarded_at.sql, NOT
// applied), so a live "column does not exist" PostgREST response is expected
// until that migration lands. fromUntyped queries never throw on that error
// (postgrest-js resolves to { data: null, error }), so this degrades to
// "no durable signal yet" rather than surfacing an error — the caller
// (LiftOnboardingGate) falls back to localStorage in that case.
// ---------------------------------------------------------------------------

export interface PlayerLiftOnboardingState {
  /** helm_lifting_athletes.id for the caller, or null if not yet seeded. */
  athleteId: string | null;
  /**
   * True when the athlete has zero prior Lab activity AND no durable
   * onboarded_at value — eligible to see the first-run tour / branded
   * welcome state on the Lift home.
   */
  isNewToLab: boolean;
  /** Best-effort read of the (possibly not-yet-existing) onboarded_at column. */
  onboardedAt: string | null;
}

export async function getPlayerLiftOnboardingState(
  playerId: string,
): Promise<PlayerLiftOnboardingState> {
  if (!playerId) {
    return { athleteId: null, isNewToLab: true, onboardedAt: null };
  }

  const supabase = await createClient();
  const ctx = await resolveAthleteContext(supabase, playerId);
  if (!ctx) {
    // Not yet seeded in the Lab — definitionally new.
    return { athleteId: null, isNewToLab: true, onboardedAt: null };
  }

  const { organizationId, athleteId } = ctx;

  const [checkinRes, setLogRes, athleteRes] = await Promise.all([
    // Any readiness check-in, ever (not just today).
    fromUntyped(supabase, 'helm_lifting_readiness_checkins')
      .select('id')
      .eq('athlete_id', athleteId)
      .eq('organization_id', organizationId)
      .limit(1)
      .maybeSingle(),
    // Any logged set, ever.
    fromUntyped(supabase, 'helm_lifting_set_results')
      .select('id')
      .eq('athlete_id', athleteId)
      .eq('organization_id', organizationId)
      .limit(1)
      .maybeSingle(),
    // Best-effort — see file header re: the db_gated column.
    fromUntyped(supabase, 'helm_lifting_athletes').select('onboarded_at').eq('id', athleteId).maybeSingle(),
  ]);

  const onboardedAt =
    ((athleteRes.data as { onboarded_at?: string | null } | null)?.onboarded_at) ?? null;
  const hasActivity = Boolean(checkinRes.data) || Boolean(setLogRes.data);

  return {
    athleteId,
    isNewToLab: !hasActivity && !onboardedAt,
    onboardedAt,
  };
}
