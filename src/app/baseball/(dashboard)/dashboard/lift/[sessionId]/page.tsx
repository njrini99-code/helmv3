// =============================================================================
// src/app/baseball/(dashboard)/dashboard/lift/[sessionId]/page.tsx
//
// V11 player lift execution (spec route /baseball/dashboard/lift/[sessionId],
// L34; "During lift" L487-499). SELF-ONLY.
//
// LANE C — ONE LIFT LAB: repointed at the canonical
// src/components/lifting/players/PlayerLiftSessionClient (native HelmLifting*
// props; writes via src/app/lifting/actions/player-sessions.ts, which is
// athlete-self / RLS-backed — no org-coach access gate, so this is safe for
// baseball athletes exactly as it is for /lifting-native ones) instead of the
// legacy src/components/baseball/performance/PlayerLiftSessionClient.
//
// Data fetched directly from helm_lifting_sessions / _session_exercises /
// _set_results here (mirroring src/app/lifting/(dashboard)/dashboard/lift/
// [sessionId]/page.tsx) rather than via getPlayerLiftSession (which still
// returns the legacy BaseballLift* adapted shape for the now-deleted
// component and is frozen for this lane).
// =============================================================================

import { notFound, redirect } from 'next/navigation';

import { getActiveBaseballContext } from '@/lib/baseball/active-context';
import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { logServerError } from '@/lib/server-error-logger';
import { PlayerLiftSessionClient } from '@/components/lifting/players/PlayerLiftSessionClient';
import { EditorsLetter } from '@/components/baseball/living-annual';
import { resolvePlayerLiftAthleteContext, hasReadinessCheckinToday } from '../_lift-athlete-context';
import type {
  HelmLiftingSessionRow,
  HelmLiftingSessionExerciseRow,
  HelmLiftingSetResultRow,
  HelmLiftingSessionWithExercises,
} from '@/lib/types/helm-lifting-data';

interface SessionFetchResult {
  session: HelmLiftingSessionWithExercises | null;
  /** True when a query genuinely errored (backend/RLS) — distinct from a
   * clean 0-rows result, which must NOT be treated as an error. */
  error: boolean;
}

async function fetchSessionWithExercises(
  sessionId: string,
  athleteId: string,
  organizationId: string,
): Promise<SessionFetchResult> {
  const supabase = await createClient();

  // athlete_id filter is an extra UX guard on top of RLS (helm_lifting_is_my_athlete).
  const { data: rawSession, error: sessionError } = (await fromUntyped(
    supabase,
    'helm_lifting_sessions',
  )
    .select('*')
    .eq('id', sessionId)
    .eq('athlete_id', athleteId)
    .eq('organization_id', organizationId)
    .maybeSingle()) as { data: HelmLiftingSessionRow | null; error: unknown };

  if (sessionError) {
    await logServerError(
      `[lift/[sessionId]] fetchSessionWithExercises session query failed: ${
        (sessionError as Error)?.message ?? String(sessionError)
      }`,
      {
        action: 'baseball.liftSessionPage.fetchSession',
        metadata: { sessionId, athleteId, organizationId },
      },
    );
    return { session: null, error: true };
  }

  if (!rawSession) return { session: null, error: false };

  const { data: exerciseRows, error: exercisesError } = (await fromUntyped(
    supabase,
    'helm_lifting_session_exercises',
  )
    .select('*')
    .eq('session_id', sessionId)
    .order('order_index', { ascending: true })) as {
    data: HelmLiftingSessionExerciseRow[] | null;
    error: unknown;
  };

  if (exercisesError) {
    await logServerError(
      `[lift/[sessionId]] fetchSessionWithExercises exercises query failed: ${
        (exercisesError as Error)?.message ?? String(exercisesError)
      }`,
      {
        action: 'baseball.liftSessionPage.fetchSession',
        metadata: { sessionId, athleteId, organizationId },
      },
    );
    return { session: null, error: true };
  }

  const exercises = exerciseRows ?? [];
  const exerciseIds = exercises.map((ex) => ex.id);
  const setsByExercise = new Map<string, HelmLiftingSetResultRow[]>();

  if (exerciseIds.length > 0) {
    const { data: setResults, error: setsError } = (await fromUntyped(
      supabase,
      'helm_lifting_set_results',
    )
      .select('*')
      .in('session_exercise_id', exerciseIds)
      .eq('athlete_id', athleteId)
      .order('set_number', { ascending: true })) as {
      data: HelmLiftingSetResultRow[] | null;
      error: unknown;
    };

    if (setsError) {
      await logServerError(
        `[lift/[sessionId]] fetchSessionWithExercises sets query failed: ${
          (setsError as Error)?.message ?? String(setsError)
        }`,
        {
          action: 'baseball.liftSessionPage.fetchSession',
          metadata: { sessionId, athleteId, organizationId },
        },
      );
      return { session: null, error: true };
    }

    for (const result of setResults ?? []) {
      const arr = setsByExercise.get(result.session_exercise_id) ?? [];
      arr.push(result);
      setsByExercise.set(result.session_exercise_id, arr);
    }
  }

  return {
    session: {
      ...rawSession,
      exercises: exercises.map((ex) => ({ ...ex, sets: setsByExercise.get(ex.id) ?? [] })),
    },
    error: false,
  };
}

export default async function PlayerLiftSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const context = await getActiveBaseballContext();
  if (!context) redirect('/baseball/login');
  if (context.activeRole === 'coach' || !context.activePlayerId) {
    redirect('/baseball/dashboard/performance');
  }

  const athleteCtx = await resolvePlayerLiftAthleteContext(context.activePlayerId);
  if (!athleteCtx) {
    // No athlete profile in the Lab yet — send back to lift home.
    redirect('/baseball/dashboard/lift');
  }

  const { organizationId, teamId, athleteId } = athleteCtx;

  const [{ session, error: sessionFetchError }, readinessSubmittedToday] = await Promise.all([
    fetchSessionWithExercises(sessionId, athleteId, organizationId),
    hasReadinessCheckinToday(athleteId, organizationId, teamId),
  ]);

  if (sessionFetchError) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6 pb-28">
        <EditorsLetter
          title="Unable to load this session"
          body="Something went wrong loading this lift session. Please refresh the page to try again."
        />
      </div>
    );
  }

  if (!session) notFound();

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-28">
      <PlayerLiftSessionClient
        session={session}
        athleteId={athleteId}
        readinessSubmittedToday={readinessSubmittedToday}
      />
    </div>
  );
}
