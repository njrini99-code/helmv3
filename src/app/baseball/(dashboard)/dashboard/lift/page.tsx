// =============================================================================
// src/app/baseball/(dashboard)/dashboard/lift/page.tsx
//
// V11 Player Lift Home (spec route /baseball/dashboard/lift, L33; "Player Lift
// Experience" L465-520). SELF-ONLY: resolves the active player from the session;
// reads getPlayerLiftHome (RLS-backed) and hands a serializable view-model to the
// client. Players only; staff are redirected to the Performance dashboard.
// =============================================================================

import { redirect } from 'next/navigation';

import { getActiveBaseballContext } from '@/lib/baseball/active-context';
import { getPlayerLiftHome, getPlayerLiftOnboardingState } from '@/lib/baseball/read-models/player-lift';
import { PlayerLiftHomeClient } from '@/components/baseball/performance/PlayerLiftHomeClient';

export default async function PlayerLiftPage() {
  const context = await getActiveBaseballContext();
  if (!context) redirect('/baseball/login');
  if (context.activeRole === 'coach' || !context.activePlayerId) {
    redirect('/baseball/dashboard/performance');
  }

  // Task C (additive): getPlayerLiftOnboardingState runs alongside the
  // existing getPlayerLiftHome fetch — independent reads, safe to
  // parallelize; getPlayerLiftHome's own behavior is untouched.
  const [home, onboarding] = await Promise.all([
    getPlayerLiftHome(context.activePlayerId),
    getPlayerLiftOnboardingState(context.activePlayerId),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <PlayerLiftHomeClient
        upcoming={home.upcoming}
        recent={home.recent}
        readinessSubmittedToday={home.readinessSubmittedToday}
        isNewToLab={onboarding.isNewToLab}
        athleteId={onboarding.athleteId}
      />
    </div>
  );
}
