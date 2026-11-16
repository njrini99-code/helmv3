import { getGolfSessionProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { PlayersOnlyRounds } from '@/clubhouse/shell/NotRebuilt';
import { getGolfDashboardRole } from '@/lib/auth/get-golf-dashboard-role';
import { ClubhouseNewRoundRoute } from '@/clubhouse/routes/round-new';

export default async function NewRoundPage() {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  const { player } = session;
  // Non-player session. This renders IN PLACE rather than
  // `redirect('/golf/dashboard?message=…')`, for two reasons that compound:
  // the destination route never reads `?message=`, so the explanation was
  // discarded; and a conditional `redirect()` out of an RSC page is what
  // produced React #310 on this route (see stats/page.tsx for the full
  // reasoning and the bare-shim evidence).
  if (!player) {
    // The Clubhouse players-only page (CH-11390, GAP-R-11, GAP-R-12), never the retired Fairway one.
    return <PlayersOnlyRounds />;
  }

  // Setup, then the round, over the shared new-round engine. The role is the dashboard layout's
  // (getGolfDashboardRole): a player row beside a coach one drawn as a coach gets the frame's not-rebuilt state.
  if ((await getGolfDashboardRole()) === 'player') return <ClubhouseNewRoundRoute playerId={player.id} />;
  return null;
}
