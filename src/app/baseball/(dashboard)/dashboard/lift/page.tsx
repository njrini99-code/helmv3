// =============================================================================
// src/app/baseball/(dashboard)/dashboard/lift/page.tsx
//
// V11 Player Lift Home (spec route /baseball/dashboard/lift, L33; "Player Lift
// Experience" L465-520). SELF-ONLY: players only; staff are redirected to the
// Performance dashboard.
//
// LANE C — ONE LIFT LAB: repointed at the canonical
// src/components/lifting/players/PlayerLiftHomeClient (native HelmLifting*
// props, no baseball-view-adapter) instead of the legacy
// src/components/baseball/performance/PlayerLiftHomeClient. Data is fetched
// directly from helm_lifting_sessions / helm_lifting_readiness_checkins here
// (mirroring src/app/lifting/(dashboard)/dashboard/lift/page.tsx) rather than
// via getPlayerLiftHome (which still returns the legacy BaseballLift* shape
// for the now-deleted component and is frozen for this lane).
//
// The first-run onboarding tour (Task C) is preserved: LiftOnboardingGate is
// a standalone overlay (not a wrapper), so it renders alongside the canonical
// list instead of inside it. The bespoke LiftLabWelcomeState branded empty
// state is not carried over — a brand-new athlete with zero upcoming/recent
// sessions now sees the canonical component's own on-brand EmptyState.
// =============================================================================

import { redirect } from 'next/navigation';

import { getActiveBaseballContext } from '@/lib/baseball/active-context';
import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { logServerError } from '@/lib/server-error-logger';
import { resolveTeamTimezone, todayIsoInTz } from '@/lib/baseball/daily-contract/contract-day';
import { getPlayerLiftOnboardingState } from '@/lib/baseball/read-models/player-lift';
import { PlayerLiftHomeClient } from '@/components/lifting/players/PlayerLiftHomeClient';
import { LiftOnboardingGate } from '@/components/baseball/performance/lift-onboarding';
import { EditorsLetter } from '@/components/baseball/living-annual';
import { resolvePlayerLiftAthleteContext, hasReadinessCheckinToday } from './_lift-athlete-context';
import type { HelmLiftingSessionRow, HelmLiftingSessionStatus } from '@/lib/types/helm-lifting-data';

const OPEN_STATUSES: HelmLiftingSessionStatus[] = ['assigned', 'started', 'modified'];

async function fetchPlayerSessions(
  athleteId: string,
  organizationId: string,
  teamId: string,
): Promise<{ upcoming: HelmLiftingSessionRow[]; recent: HelmLiftingSessionRow[]; error: boolean }> {
  const supabase = await createClient();
  const today = todayIsoInTz(await resolveTeamTimezone(supabase, teamId));

  // Today + future and overdue-but-still-open are fetched as SEPARATE
  // bounded queries (each with its own .limit()), not one combined query
  // capped at 20. A single capped query orders ascending by scheduled_date,
  // so overdue-open rows (earlier dates) sort BEFORE today/future rows —
  // 20+ overdue-open sessions would fill the entire cap and push today's
  // session out of the result set entirely, showing "No lift today" even
  // though a session exists.
  const [
    { data: currentFutureRows, error: currentFutureError },
    { data: overdueOpenRows, error: overdueOpenError },
  ] = (await Promise.all([
    fromUntyped(supabase, 'helm_lifting_sessions')
      .select('*')
      .eq('athlete_id', athleteId)
      .eq('organization_id', organizationId)
      .gte('scheduled_date', today)
      .order('scheduled_date', { ascending: true })
      .limit(20),
    fromUntyped(supabase, 'helm_lifting_sessions')
      .select('*')
      .eq('athlete_id', athleteId)
      .eq('organization_id', organizationId)
      .in('status', OPEN_STATUSES)
      .lt('scheduled_date', today)
      .order('scheduled_date', { ascending: true })
      .limit(20),
  ])) as [
    { data: HelmLiftingSessionRow[] | null; error: unknown },
    { data: HelmLiftingSessionRow[] | null; error: unknown },
  ];

  if (currentFutureError) {
    await logServerError(
      `[lift/page] fetchPlayerSessions current/future query failed: ${
        (currentFutureError as Error)?.message ?? String(currentFutureError)
      }`,
      { action: 'lift.fetchPlayerSessions', metadata: { athleteId, teamId, phase: 'current_future' } },
    );
  }
  if (overdueOpenError) {
    await logServerError(
      `[lift/page] fetchPlayerSessions overdue-open query failed: ${
        (overdueOpenError as Error)?.message ?? String(overdueOpenError)
      }`,
      { action: 'lift.fetchPlayerSessions', metadata: { athleteId, teamId, phase: 'overdue_open' } },
    );
  }

  // Overdue-open rows are all < today and already ascending, so concatenating
  // them ahead of the current/future rows (also ascending) preserves overall
  // chronological order without needing an extra merge-sort.
  const upcoming = [...(overdueOpenRows ?? []), ...(currentFutureRows ?? [])];

  const { data: recentRows, error: recentError } = (await fromUntyped(supabase, 'helm_lifting_sessions')
    .select('*')
    .eq('athlete_id', athleteId)
    .eq('organization_id', organizationId)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(10)) as { data: HelmLiftingSessionRow[] | null; error: unknown };

  if (recentError) {
    await logServerError(
      `[lift/page] fetchPlayerSessions recent query failed: ${
        (recentError as Error)?.message ?? String(recentError)
      }`,
      { action: 'lift.fetchPlayerSessions', metadata: { athleteId, phase: 'recent' } },
    );
  }

  return {
    upcoming,
    recent: recentRows ?? [],
    error: Boolean(currentFutureError || overdueOpenError || recentError),
  };
}

export default async function PlayerLiftPage() {
  const context = await getActiveBaseballContext();
  if (!context) redirect('/baseball/login');
  if (context.activeRole === 'coach' || !context.activePlayerId) {
    redirect('/baseball/dashboard/performance');
  }

  const athleteCtx = await resolvePlayerLiftAthleteContext(context.activePlayerId);

  // Not yet seeded in the Lab (org-less team, or backfill hasn't run) —
  // render the canonical component's own honest empty state.
  if (!athleteCtx) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6">
        <PlayerLiftHomeClient upcoming={[]} recent={[]} readinessSubmittedToday={false} />
      </div>
    );
  }

  const { organizationId, teamId, athleteId } = athleteCtx;

  const [{ upcoming, recent, error: sessionsError }, readinessSubmittedToday, onboarding] =
    await Promise.all([
      fetchPlayerSessions(athleteId, organizationId, teamId),
      hasReadinessCheckinToday(athleteId, organizationId, teamId),
      getPlayerLiftOnboardingState(context.activePlayerId),
    ]);

  if (sessionsError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6">
        <EditorsLetter
          title="Unable to load your lift sessions"
          body="Something went wrong loading your Lift Lab data. Please refresh the page to try again."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <PlayerLiftHomeClient
        upcoming={upcoming}
        recent={recent}
        readinessSubmittedToday={readinessSubmittedToday}
      />
      <LiftOnboardingGate
        athleteId={onboarding.athleteId}
        eligibleForOnboarding={onboarding.isNewToLab}
      />
    </div>
  );
}
