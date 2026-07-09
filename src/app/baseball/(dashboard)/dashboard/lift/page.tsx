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
import { resolveTeamTimezone, todayIsoInTz } from '@/lib/baseball/daily-contract/contract-day';
import { getPlayerLiftOnboardingState } from '@/lib/baseball/read-models/player-lift';
import { PlayerLiftHomeClient } from '@/components/lifting/players/PlayerLiftHomeClient';
import { LiftOnboardingGate } from '@/components/baseball/performance/lift-onboarding';
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

  // Upcoming: today + future, plus overdue-but-still-open (mirrors the
  // canonical /lifting/dashboard/lift resolution exactly).
  const { data: upcomingRows, error: upcomingError } = (await fromUntyped(
    supabase,
    'helm_lifting_sessions',
  )
    .select('*')
    .eq('athlete_id', athleteId)
    .eq('organization_id', organizationId)
    .or(
      `and(scheduled_date.gte.${today}),` +
        `and(status.in.(assigned,started,modified),scheduled_date.lt.${today})`,
    )
    .order('scheduled_date', { ascending: true })
    .limit(20)) as { data: HelmLiftingSessionRow[] | null; error: unknown };

  if (upcomingError) {
    console.error('[lift/page] fetchPlayerSessions upcoming query failed', upcomingError);
  }

  const upcoming = (upcomingRows ?? []).filter(
    (s) => s.scheduled_date >= today || OPEN_STATUSES.includes(s.status),
  );

  const { data: recentRows, error: recentError } = (await fromUntyped(supabase, 'helm_lifting_sessions')
    .select('*')
    .eq('athlete_id', athleteId)
    .eq('organization_id', organizationId)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(10)) as { data: HelmLiftingSessionRow[] | null; error: unknown };

  if (recentError) {
    console.error('[lift/page] fetchPlayerSessions recent query failed', recentError);
  }

  return {
    upcoming,
    recent: recentRows ?? [],
    error: Boolean(upcomingError || recentError),
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
        <div className="glass-standard rounded-2xl border border-cream-400/40 p-8 shadow-glass">
          <h2 className="text-h3 text-warm-900">Unable to load your lift sessions</h2>
          <p className="mt-2 text-body text-warm-500">
            Something went wrong loading your Lift Lab data. Please refresh the page to try again.
          </p>
        </div>
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
