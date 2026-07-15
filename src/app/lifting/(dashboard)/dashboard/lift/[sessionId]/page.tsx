// =============================================================================
// src/app/lifting/(dashboard)/dashboard/lift/[sessionId]/page.tsx
//
// LIFTING LAB — Athlete-facing session execution page (server component wrapper).
//
// Resolution:
//   1. Authenticate the user.
//   2. Resolve the athlete's helm_lifting_athletes.id (multi-sport fallback).
//   3. Fetch the session row + its exercises (ordered by order_index) + the
//      athlete's existing set results for this session, building a
//      HelmLiftingSessionWithExercises for PlayerLiftSessionClient.
//   4. Verify the session belongs to this athlete (ownership guard before
//      rendering — RLS is the hard backstop; this is a UX guard).
//   5. Check today's readiness check-in status.
//   6. Mount PlayerLiftSessionClient with the assembled props.
//
// If the session is not found or belongs to a different athlete, redirects to
// /lifting/dashboard/lift so the user sees their own sessions.
// =============================================================================

import { redirect, notFound } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { PlayerLiftSessionClient } from '@/components/lifting/players/PlayerLiftSessionClient';
import { resolveLiftingAthleteTimezone } from '@/lib/lifting/resolve-athlete-timezone';
import { todayIsoInTz } from '@/lib/baseball/daily-contract/contract-day';
import type {
  HelmLiftingSessionRow,
  HelmLiftingSessionExerciseRow,
  HelmLiftingSetResultRow,
  HelmLiftingSessionWithExercises,
  HelmLiftingReadinessCheckinRow,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// Athlete ID resolution — mirrors player-sessions.ts
// ---------------------------------------------------------------------------

async function resolveAthleteId(userId: string): Promise<string | null> {
  const supabase = await createClient();

  // 1. Baseball player → org → athlete row
  const { data: baseballRow } = await fromUntyped(supabase, 'baseball_players')
    .select('id, baseball_teams(organization_id)')
    .eq('user_id', userId)
    .maybeSingle() as {
    data: { id: string; baseball_teams?: { organization_id?: string } | null } | null;
  };

  if (baseballRow) {
    const orgId = baseballRow.baseball_teams?.organization_id ?? null;
    if (orgId) {
      const { data: athleteRow } = await fromUntyped(supabase, 'helm_lifting_athletes')
        .select('id')
        .eq('organization_id', orgId)
        .eq('sport', 'baseball')
        .eq('sport_player_id', baseballRow.id)
        .eq('is_active', true)
        .maybeSingle() as { data: { id: string } | null };
      if (athleteRow) return athleteRow.id;
    }
  }

  // 2. Golf player → org → athlete row
  const { data: golfRow } = await fromUntyped(supabase, 'golf_players')
    .select('id, golf_team_members(golf_teams(organization_id))')
    .eq('user_id', userId)
    .maybeSingle() as {
    data: {
      id: string;
      golf_team_members?: Array<{ golf_teams?: { organization_id?: string } | null }> | null;
    } | null;
  };

  if (golfRow) {
    const orgId = golfRow.golf_team_members?.[0]?.golf_teams?.organization_id ?? null;
    if (orgId) {
      const { data: athleteRow } = await fromUntyped(supabase, 'helm_lifting_athletes')
        .select('id')
        .eq('organization_id', orgId)
        .eq('sport', 'golf')
        .eq('sport_player_id', golfRow.id)
        .eq('is_active', true)
        .maybeSingle() as { data: { id: string } | null };
      if (athleteRow) return athleteRow.id;
    }
  }

  // 3. Direct user_id fallback
  const { data: directRow } = await fromUntyped(supabase, 'helm_lifting_athletes')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle() as { data: { id: string } | null };

  return directRow?.id ?? null;
}

// ---------------------------------------------------------------------------
// Session data assembly
// ---------------------------------------------------------------------------

async function fetchSessionWithExercises(
  sessionId: string,
  athleteId: string,
): Promise<HelmLiftingSessionWithExercises | null> {
  const supabase = await createClient();

  // Fetch session row — athlete_id filter here is an extra UX guard
  // (RLS is the hard backstop via helm_lifting_is_my_athlete).
  const { data: session } = await fromUntyped(supabase, 'helm_lifting_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('athlete_id', athleteId)
    .maybeSingle() as { data: HelmLiftingSessionRow | null };

  if (!session) return null;

  // Fetch exercises ordered by order_index
  const { data: exercises } = await fromUntyped(supabase, 'helm_lifting_session_exercises')
    .select('*')
    .eq('session_id', sessionId)
    .order('order_index', { ascending: true }) as {
    data: HelmLiftingSessionExerciseRow[] | null;
  };

  const exerciseRows = exercises ?? [];

  // Fetch the athlete's existing set results for this session (for resuming)
  const exerciseIds = exerciseRows.map((ex) => ex.id);
  const setResultsByExercise: Record<string, HelmLiftingSetResultRow[]> = {};

  if (exerciseIds.length > 0) {
    const { data: setResults } = await fromUntyped(supabase, 'helm_lifting_set_results')
      .select('*')
      .in('session_exercise_id', exerciseIds)
      .eq('athlete_id', athleteId)
      .order('set_number', { ascending: true }) as {
      data: HelmLiftingSetResultRow[] | null;
    };

    for (const result of setResults ?? []) {
      const arr = setResultsByExercise[result.session_exercise_id] ?? [];
      arr.push(result);
      setResultsByExercise[result.session_exercise_id] = arr;
    }
  }

  return {
    ...session,
    exercises: exerciseRows.map((ex) => ({
      ...ex,
      sets: setResultsByExercise[ex.id] ?? [],
    })),
  };
}

async function checkReadinessToday(athleteId: string, today: string): Promise<boolean> {
  const supabase = await createClient();

  const { data } = await fromUntyped(supabase, 'helm_lifting_readiness_checkins')
    .select('id')
    .eq('athlete_id', athleteId)
    .eq('checkin_date', today)
    .maybeSingle() as { data: HelmLiftingReadinessCheckinRow | null };

  return data !== null;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface PageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function PlayerLiftSessionPage({ params }: PageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/lifting/login');
  }

  const { sessionId } = await params;

  const athleteId = await resolveAthleteId(user.id);

  if (!athleteId) {
    // No athlete profile — send back to lift home
    redirect('/lifting/dashboard/lift');
  }

  // Resolve the athlete's own team-local "today" for the checkin_date lookup
  // — mirrors the baseball Daily Contract's resolveTeamTimezone + todayIsoInTz
  // idiom (see PlayerLiftPage, the sibling lift-home page) so this page and
  // the lift home agree on the same day boundary and can't drift apart.
  const today = todayIsoInTz(await resolveLiftingAthleteTimezone(athleteId));

  const [session, readinessSubmittedToday] = await Promise.all([
    fetchSessionWithExercises(sessionId, athleteId),
    checkReadinessToday(athleteId, today),
  ]);

  if (!session) {
    // Session not found or belongs to another athlete
    notFound();
  }

  return (
    <PlayerLiftSessionClient
      session={session}
      athleteId={athleteId}
      readinessSubmittedToday={readinessSubmittedToday}
      basePath="/lifting/dashboard"
    />
  );
}
