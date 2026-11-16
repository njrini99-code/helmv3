import { getGolfSessionProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { PlayersOnlyRounds } from '@/clubhouse/shell/NotRebuilt';
import { getGolfDashboardRole } from '@/lib/auth/get-golf-dashboard-role';
import { ClubhouseRoundRecoverRoute } from '@/clubhouse/routes/round-recover';

export default async function RecoverRoundPage() {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  const { player } = session;
  // Renders in place rather than redirecting — see stats/page.tsx for why a
  // conditional `redirect()` out of an RSC page produced React #310 here.
  if (!player) {
    // The Clubhouse players-only page (CH-11390, GAP-R-11, GAP-R-12), never the retired Fairway one.
    return <PlayersOnlyRounds />;
  }

  // The device scan, Restore and Discard. The role is the dashboard layout's (getGolfDashboardRole): a player row
  // beside a coach one drawn as a coach gets the frame's not-rebuilt state.
  if ((await getGolfDashboardRole()) === 'player') return <ClubhouseRoundRecoverRoute playerId={player.id} />;
  return null;
}
