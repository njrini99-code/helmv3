import { getGolfSessionProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { FeatureUnavailable } from '@/components/fairway';
import { getGolfDashboardRole } from '@/lib/auth/get-golf-dashboard-role';
import { ClubhouseNewRoundRoute } from '@/clubhouse/routes/round-new';

export default async function NewRoundPage() {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  const { player, coach } = session;
  // Non-player session. This renders IN PLACE rather than
  // `redirect('/golf/dashboard?message=…')`, for two reasons that compound:
  // the destination route never reads `?message=`, so the explanation was
  // discarded; and a conditional `redirect()` out of an RSC page is what
  // produced React #310 on this route (see stats/page.tsx for the full
  // reasoning and the bare-shim evidence).
  if (!player) {
    return (
      <FeatureUnavailable
        title="Log a Round"
        message={
          coach
            ? 'Only players submit rounds. As a coach you can review submitted rounds from Team Stats.'
            : 'No player profile found. Please complete onboarding before logging a round.'
        }
        actionHref={coach ? '/golf/dashboard/stats/team' : '/golf/dashboard'}
        actionLabel={coach ? 'Team Stats' : 'Back to Dashboard'}
      />
    );
  }

  // Setup, then the round, over the shared new-round engine. The role is the dashboard layout's
  // (getGolfDashboardRole): a player row beside a coach one drawn as a coach gets the frame's not-rebuilt state.
  if ((await getGolfDashboardRole()) === 'player') return <ClubhouseNewRoundRoute playerId={player.id} />;
  return null;
}
