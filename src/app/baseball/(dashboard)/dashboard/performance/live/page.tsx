// =============================================================================
// src/app/baseball/(dashboard)/dashboard/performance/live/page.tsx
//
// V11 Live Weight Room mode (spec L27, L522-573 + Packet G). SERVER-GATED
// (defense in depth, never nav-hiding alone):
//   * Resolves the server-validated active baseball context (cookie re-validated).
//   * STAFF only — players are redirected to their own lift surface.
//   * Requires can_manage_lifting (this surface WRITES sets/loads/subs for the
//     athletes; readiness is shown additively when can_view_readiness is held).
//
// LANE C — ONE LIFT LAB: repointed at the canonical
// src/components/lifting/sessions/LiveWeightRoomClient (native
// HelmLiftingLiveAthleteRow[] props, realtime postgres_changes subscriptions)
// instead of the legacy src/components/baseball/performance/LiveWeightRoom.
// Data assembled directly from helm_lifting_* (mirroring
// src/app/lifting/(dashboard)/dashboard/sessions/live/page.tsx), team-scoped
// via helm_lifting_sessions.team_id.
//
// canViewReadiness is honored server-side by omitting readiness_band /
// readiness check-in reads entirely when the caller lacks the grant — the
// canonical component has no readiness visibility gate of its own, so the
// gate lives in what this page chooses to fetch and pass down.
//
// Not carried over from the legacy surface: the `?group=` deep-linkable
// group filter (the canonical component's group filter is internal client
// state only) and the coach-facing playerNameById substitute-picker label
// map (the canonical row shape already carries first_name/last_name
// natively, so no map is needed). See this lane's report.
//
// WRITES: advanceSessionLifecycle / logSetResult from
// src/app/lifting/actions/sessions.ts (withLiftingAction, requireEdit:true —
// see this lane's report for the confirmed helm_lifting_coaches access-gate
// gap for baseball staff who haven't onboarded through /lifting).
// =============================================================================

import { redirect } from 'next/navigation';

import { getActiveBaseballContext } from '@/lib/baseball/active-context';
import { resolveBaseballCapabilities } from '@/lib/baseball/capabilities';
import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { resolveBaseballLiftingOrg } from '@/lib/lifting/resolve-baseball-context';
import {
  resolveTeamTimezone,
  todayIsoInTz,
} from '@/lib/baseball/daily-contract/contract-day';
import { logServerError } from '@/lib/server-error-logger';
import { ReadModelStateNotice } from '@/components/baseball/ReadModelStateNotice';
import { LiveWeightRoomClient } from '@/components/lifting/sessions/LiveWeightRoomClient';
import type {
  HelmLiftingSessionRow,
  HelmLiftingSessionExerciseRow,
  HelmLiftingSetResultRow,
  HelmLiftingAvailabilityStatus,
  HelmLiftingReadinessBand,
  HelmLiftingLiveAthleteRow,
} from '@/lib/types/helm-lifting-data';
import type { HelmLiftingAthleteRow } from '@/lib/types/helm-lifting';

const LIVE_ROOM_ACTION = 'baseball.performance.live.buildLiveRoomData';

type UntypedQueryError = { message: string } | null;

async function logQueryError(table: string, error: UntypedQueryError, teamId: string) {
  if (!error) return;
  await logServerError(`Failed to load ${table}: ${error.message}`, {
    action: LIVE_ROOM_ACTION,
    sport: 'baseball',
    teamId,
  });
}

type LiveRoomResult =
  | {
      ok: true;
      athletes: HelmLiftingLiveAthleteRow[];
      exerciseLibrary: Array<{ id: string; name: string; category: string | null }>;
    }
  | { ok: false };

async function buildLiveRoomData(
  organizationId: string,
  teamId: string,
  canViewReadiness: boolean,
): Promise<LiveRoomResult> {
  const supabase = await createClient();
  const today = todayIsoInTz(await resolveTeamTimezone(supabase, teamId));

  const { data: sessions, error: sessionsError } = (await fromUntyped(supabase, 'helm_lifting_sessions')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('team_id', teamId)
    .eq('scheduled_date', today)
    .order('athlete_id', { ascending: true })) as { data: HelmLiftingSessionRow[] | null; error: UntypedQueryError };
  await logQueryError('helm_lifting_sessions', sessionsError, teamId);

  if (sessionsError) {
    // A genuine query/RLS failure must never render identically to a
    // legitimately empty live board (a real "no sessions today" is `!sessions
    // || sessions.length === 0` with NO error) — surface it distinctly so
    // the page renders the error notice instead of an empty athlete grid.
    return { ok: false };
  }

  if (!sessions || sessions.length === 0) {
    const { data: exercises, error: exercisesError } = (await fromUntyped(supabase, 'helm_lifting_exercises')
      .select('id, name, category')
      .eq('sport', 'baseball')
      .eq('is_active', true)
      .or(`organization_id.eq.${organizationId},is_global.eq.true`)
      .order('name', { ascending: true })
      .limit(200)) as { data: Array<{ id: string; name: string; category: string | null }> | null; error: UntypedQueryError };
    await logQueryError('helm_lifting_exercises', exercisesError, teamId);
    return { ok: true, athletes: [], exerciseLibrary: exercises ?? [] };
  }

  const sessionIds = sessions.map((s) => s.id);
  const athleteIds = [...new Set(sessions.map((s) => s.athlete_id))];

  // Fetched ahead of the Promise.all batch below because helm_lifting_set_results
  // has no session_id column (only session_exercise_id) — the set-results query
  // must filter on the exercise ids derived from this result, not sessionIds.
  const { data: sessionExercises, error: sessionExercisesError } = (await fromUntyped(supabase, 'helm_lifting_session_exercises')
    .select('*')
    .in('session_id', sessionIds)
    .order('order_index', { ascending: true })) as { data: HelmLiftingSessionExerciseRow[] | null; error: UntypedQueryError };
  await logQueryError('helm_lifting_session_exercises', sessionExercisesError, teamId);

  if (sessionExercisesError) {
    // This is the load-bearing query for the write surface: a hard failure
    // here yields exerciseIds = [] and every athlete rendering with
    // exercises: [], total_exercises: 0 — indistinguishable from "athletes
    // have no assigned work" (same error-vs-empty conflation `sessionsError`
    // above already guards against). Surface it, don't degrade.
    return { ok: false };
  }

  const exerciseIds = (sessionExercises ?? []).map((se) => se.id);
  type LatestSetRow = Pick<HelmLiftingSetResultRow, 'session_exercise_id' | 'athlete_id' | 'set_number' | 'actual_load' | 'rpe'> & { created_at: string };

  const [
    { data: athletes, error: athletesError },
    { data: setResults, error: setResultsError },
    checkinsResult,
    { data: availabilities, error: availabilitiesError },
    { data: groupMembers, error: groupMembersError },
    { data: exercises, error: exercisesError },
  ] = await Promise.all([
    fromUntyped(supabase, 'helm_lifting_athletes')
      .select('id, first_name, last_name, position, sport, user_id')
      .in('id', athleteIds) as Promise<{
        data: Array<Pick<HelmLiftingAthleteRow, 'id' | 'first_name' | 'last_name' | 'position' | 'sport' | 'user_id'>> | null;
        error: UntypedQueryError;
      }>,
    exerciseIds.length > 0
      ? (fromUntyped(supabase, 'helm_lifting_set_results')
          .select('session_exercise_id, athlete_id, set_number, actual_load, rpe, created_at')
          .in('session_exercise_id', exerciseIds)
          .order('created_at', { ascending: false }) as Promise<{ data: LatestSetRow[] | null; error: UntypedQueryError }>)
      : Promise.resolve({ data: [] as LatestSetRow[], error: null as UntypedQueryError }),
    // Readiness check-ins are only fetched at all when the caller holds
    // can_view_readiness — an unauthorized caller never sees the data,
    // rather than the component just hiding a value it was handed.
    canViewReadiness
      ? (fromUntyped(supabase, 'helm_lifting_readiness_checkins')
          .select('athlete_id, readiness_score, readiness_band')
          .in('athlete_id', athleteIds)
          .eq('checkin_date', today) as Promise<{
            data: Array<{ athlete_id: string; readiness_score: number | null; readiness_band: string | null }> | null;
            error: UntypedQueryError;
          }>)
      : Promise.resolve({ data: [] as Array<{ athlete_id: string; readiness_score: number | null; readiness_band: string | null }>, error: null as UntypedQueryError }),
    fromUntyped(supabase, 'helm_lifting_availability_statuses')
      .select('athlete_id, status')
      .in('athlete_id', athleteIds)
      .lte('starts_at', today)
      .or(`ends_at.is.null,ends_at.gte.${today}`) as Promise<{
        data: Array<{ athlete_id: string; status: string }> | null;
        error: UntypedQueryError;
      }>,
    fromUntyped(supabase, 'helm_lifting_group_members')
      .select('athlete_id, helm_lifting_groups(name)')
      .in('athlete_id', athleteIds)
      .is('ends_at', null) as Promise<{
        data: Array<{ athlete_id: string; helm_lifting_groups: { name: string } | null }> | null;
        error: UntypedQueryError;
      }>,
    fromUntyped(supabase, 'helm_lifting_exercises')
      .select('id, name, category')
      .eq('sport', 'baseball')
      .eq('is_active', true)
      .or(`organization_id.eq.${organizationId},is_global.eq.true`)
      .order('name', { ascending: true })
      .limit(200) as Promise<{
        data: Array<{ id: string; name: string; category: string | null }> | null;
        error: UntypedQueryError;
      }>,
  ]);

  await Promise.all([
    logQueryError('helm_lifting_athletes', athletesError, teamId),
    logQueryError('helm_lifting_set_results', setResultsError, teamId),
    logQueryError('helm_lifting_readiness_checkins', checkinsResult.error, teamId),
    logQueryError('helm_lifting_availability_statuses', availabilitiesError, teamId),
    logQueryError('helm_lifting_group_members', groupMembersError, teamId),
    logQueryError('helm_lifting_exercises (live-room)', exercisesError, teamId),
  ]);

  if (athletesError) {
    // A failed athletes read silently drops every name/position (athleteMap
    // stays empty) and every row falls back to null fields — same
    // error-vs-empty conflation as sessionsError/sessionExercisesError above.
    return { ok: false };
  }

  const checkins = checkinsResult.data;

  const athleteMap = new Map((athletes ?? []).map((a) => [a.id, a]));
  const checkinMap = new Map((checkins ?? []).map((c) => [c.athlete_id, c]));
  const availMap = new Map((availabilities ?? []).map((a) => [a.athlete_id, a.status]));

  const groupNamesByAthlete = new Map<string, string[]>();
  for (const gm of groupMembers ?? []) {
    const names = groupNamesByAthlete.get(gm.athlete_id) ?? [];
    if (gm.helm_lifting_groups?.name) names.push(gm.helm_lifting_groups.name);
    groupNamesByAthlete.set(gm.athlete_id, names);
  }

  const exercisesBySession = new Map<string, HelmLiftingSessionExerciseRow[]>();
  for (const se of sessionExercises ?? []) {
    const arr = exercisesBySession.get(se.session_id) ?? [];
    arr.push(se);
    exercisesBySession.set(se.session_id, arr);
  }

  const latestSetBySeId = new Map<string, { actual_load: number | null; rpe: number | null; created_at: string }>();
  for (const sr of setResults ?? []) {
    const existing = latestSetBySeId.get(sr.session_exercise_id);
    if (!existing || sr.created_at > existing.created_at) {
      latestSetBySeId.set(sr.session_exercise_id, {
        actual_load: sr.actual_load,
        rpe: sr.rpe,
        created_at: sr.created_at,
      });
    }
  }

  const liveAthletes: HelmLiftingLiveAthleteRow[] = sessions.map((session) => {
    const athlete = athleteMap.get(session.athlete_id);
    const seList = exercisesBySession.get(session.id) ?? [];
    // Prefer the (order-first) assigned exercise over any completed one — the
    // old `assigned || completed` find picked whichever came first in order,
    // so once exercise 1 was completed and exercise 2 assigned, the row could
    // keep showing exercise 1 as "current" instead of advancing.
    const currentSe =
      seList.find((e) => e.status === 'assigned') ??
      [...seList].reverse().find((e) => e.status === 'completed');
    const latestSet = currentSe ? latestSetBySeId.get(currentSe.id) : undefined;
    const checkin = checkinMap.get(session.athlete_id);
    const completedCount = seList.filter((e) => e.status === 'completed').length;

    return {
      session_id: session.id,
      athlete_id: session.athlete_id,
      user_id: athlete?.user_id ?? null,
      first_name: athlete?.first_name ?? null,
      last_name: athlete?.last_name ?? null,
      position: athlete?.position ?? null,
      sport: (athlete?.sport ?? 'baseball') as 'baseball' | 'golf',
      group_names: groupNamesByAthlete.get(session.athlete_id) ?? [],
      session_status: session.status,
      readiness_band: (checkin?.readiness_band ?? null) as HelmLiftingReadinessBand | null,
      availability_status: (availMap.get(session.athlete_id) ?? null) as HelmLiftingAvailabilityStatus | null,
      current_exercise: currentSe?.exercise_name_snapshot ?? null,
      prescribed_load: currentSe?.prescribed_load ?? null,
      actual_load: latestSet?.actual_load ?? null,
      rpe: latestSet?.rpe ?? null,
      last_update: latestSet?.created_at ?? session.updated_at,
      has_load_change: (latestSet?.actual_load ?? null) !== (currentSe?.prescribed_load ?? null) && latestSet?.actual_load != null,
      needs_coach: session.coach_review_status === 'needs_review',
      exercises: seList,
      total_exercises: seList.length,
      completed_exercises: completedCount,
    };
  });

  return { ok: true, athletes: liveAthletes, exerciseLibrary: exercises ?? [] };
}

export default async function LiveWeightRoomPage() {
  const context = await getActiveBaseballContext();
  if (!context) redirect('/baseball/login');
  if (context.activeRole !== 'coach') redirect('/baseball/player/today');

  const teamId = context.activeTeamId;
  const caps = await resolveBaseballCapabilities(teamId);
  if (!caps.can_manage_lifting) {
    // Readiness-only viewers don't get the WRITE surface — send them to the
    // read-only command center where they can still review the board + queue.
    redirect('/baseball/dashboard/performance');
  }
  const canViewReadiness = caps.can_view_readiness;

  const liftCtx = await resolveBaseballLiftingOrg(teamId);

  // A missing lifting context is a setup gap, not a healthy empty room — it
  // must never fall through to LiveWeightRoomClient with orgId="" (which
  // would render the WRITABLE live surface pointed at no real org). Fail
  // closed with the same explicit "not set up" card the programs list page
  // uses, instead of degrading to `{ ok: true, athletes: [], ... }`.
  if (!liftCtx) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="rounded-2xl border border-warm-200/60 bg-cream-50 px-6 py-10 text-center">
          <h2 className="text-h3 font-semibold text-warm-900">Lift Lab access not set up</h2>
          <p className="mx-auto mt-2 max-w-md text-body-sm text-warm-500">
            This team isn&apos;t linked to a Lifting Lab organization yet. Ask an admin to link it
            before the live weight room can be used.
          </p>
        </div>
      </div>
    );
  }

  const liveRoomResult: LiveRoomResult = await buildLiveRoomData(
    liftCtx.organizationId,
    teamId,
    canViewReadiness,
  );

  if (!liveRoomResult.ok) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6">
        <ReadModelStateNotice state="error" title="Live weight room could not load" />
      </div>
    );
  }

  return (
    <LiveWeightRoomClient
      initialAthletes={liveRoomResult.athletes}
      exerciseLibrary={liveRoomResult.exerciseLibrary}
      orgId={liftCtx.organizationId}
      canEdit={caps.can_manage_lifting}
    />
  );
}
