// =============================================================================
// src/app/lifting/(dashboard)/dashboard/sessions/live/page.tsx
//
// Helm Lifting Lab — live weight room page (server component).
// Loads today's sessions + athlete/group data, renders LiveWeightRoomClient.
// =============================================================================

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { resolveLiftingAccess } from '@/lib/lifting/access';
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

async function getOrgId(userId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await fromUntyped(supabase, 'helm_lifting_coaches')
    .select('organization_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1) as { data: Array<{ organization_id: string }> | null };
  return data?.[0]?.organization_id ?? null;
}

async function buildLiveRoomData(orgId: string): Promise<{
  athletes: HelmLiftingLiveAthleteRow[];
  exerciseLibrary: Array<{ id: string; name: string; category: string | null }>;
}> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  // Today's sessions for this org.
  const { data: sessions } = await fromUntyped(supabase, 'helm_lifting_sessions')
    .select('*')
    .eq('organization_id', orgId)
    .eq('scheduled_date', today)
    .order('athlete_id', { ascending: true }) as { data: HelmLiftingSessionRow[] | null };

  if (!sessions || sessions.length === 0) {
    return { athletes: [], exerciseLibrary: [] };
  }

  const sessionIds = sessions.map((s) => s.id);
  const athleteIds = [...new Set(sessions.map((s) => s.athlete_id))];

  // Batch fetches.
  const [
    { data: athletes },
    { data: sessionExercises },
    { data: setResults },
    { data: checkins },
    { data: availabilities },
    { data: groupMembers },
    { data: exercises },
  ] = await Promise.all([
    fromUntyped(supabase, 'helm_lifting_athletes')
      .select('id, first_name, last_name, position, sport, user_id')
      .in('id', athleteIds) as Promise<{
        data: Array<Pick<HelmLiftingAthleteRow, 'id' | 'first_name' | 'last_name' | 'position' | 'sport' | 'user_id'>> | null
      }>,
    fromUntyped(supabase, 'helm_lifting_session_exercises')
      .select('*')
      .in('session_id', sessionIds)
      .order('order_index', { ascending: true }) as Promise<{ data: HelmLiftingSessionExerciseRow[] | null }>,
    fromUntyped(supabase, 'helm_lifting_set_results')
      .select('session_exercise_id, athlete_id, set_number, actual_load, rpe, created_at')
      .in('session_id', sessionIds)
      .order('created_at', { ascending: false }) as Promise<{
        data: Array<Pick<HelmLiftingSetResultRow, 'session_exercise_id' | 'athlete_id' | 'set_number' | 'actual_load' | 'rpe'> & { created_at: string }> | null
      }>,
    fromUntyped(supabase, 'helm_lifting_readiness_checkins')
      .select('athlete_id, readiness_score, readiness_band')
      .in('athlete_id', athleteIds)
      .eq('checkin_date', today) as Promise<{
        data: Array<{ athlete_id: string; readiness_score: number | null; readiness_band: string | null }> | null
      }>,
    fromUntyped(supabase, 'helm_lifting_availability_statuses')
      .select('athlete_id, status')
      .in('athlete_id', athleteIds)
      .lte('starts_at', today)
      .or(`ends_at.is.null,ends_at.gte.${today}`) as Promise<{
        data: Array<{ athlete_id: string; status: string }> | null
      }>,
    fromUntyped(supabase, 'helm_lifting_group_members')
      .select('athlete_id, helm_lifting_groups(name)')
      .in('athlete_id', athleteIds)
      .is('ends_at', null) as Promise<{
        data: Array<{ athlete_id: string; helm_lifting_groups: { name: string } | null }> | null
      }>,
    fromUntyped(supabase, 'helm_lifting_exercises')
      .select('id, name, category')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order('name', { ascending: true })
      .limit(200) as Promise<{
        data: Array<{ id: string; name: string; category: string | null }> | null
      }>,
  ]);

  // Build lookups.
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

  // Latest set result per session_exercise.
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
    const currentSe = seList.find((e) => e.status === 'assigned' || e.status === 'completed');
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

  return { athletes: liveAthletes, exerciseLibrary: exercises ?? [] };
}

export default async function LiveWeightRoomPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/lifting/login');

  const orgId = await getOrgId(user.id);
  if (!orgId) redirect('/lifting/coach');

  const access = await resolveLiftingAccess(orgId);
  if (!access.canView) redirect('/lifting/login');

  const { athletes, exerciseLibrary } = await buildLiveRoomData(orgId);

  return (
    <LiveWeightRoomClient
      initialAthletes={athletes}
      exerciseLibrary={exerciseLibrary}
      orgId={orgId}
      canEdit={access.canEdit}
    />
  );
}
