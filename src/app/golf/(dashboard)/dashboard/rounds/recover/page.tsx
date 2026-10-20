import { getGolfSessionProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { fairwayScope } from '@/lib/redesign/flag';
import { FairwayRecoverRound } from '@/components/fairway/pages/rounds-recover';
import { FeatureUnavailable } from '@/components/fairway';
import { isClubhouseFor } from '@/clubhouse/gate';
import { getGolfDashboardRole } from '@/lib/auth/get-golf-dashboard-role';
import { ClubhouseRoundRecoverRoute } from '@/clubhouse/routes/round-recover';

export default async function RecoverRoundPage() {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  const { player } = session;
  // Renders in place rather than redirecting — see stats/page.tsx for why a
  // conditional `redirect()` out of an RSC page produced React #310 here.
  if (!player) {
    return (
      <FeatureUnavailable
        title="Recover a Round"
        message="Round recovery restores a player's own unfinished round. This session has no player profile."
      />
    );
  }

  // Clubhouse round recovery (golf_clubhouse_ui): the same device scan, Restore and Discard, drawn in Clubhouse.
  // The role is the dashboard layout's (getGolfDashboardRole); Fairway below keeps the session's.
  if ((await isClubhouseFor('player')) && (await getGolfDashboardRole()) === 'player') return <ClubhouseRoundRecoverRoute playerId={player.id} />;

  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <FairwayRecoverRound playerId={player.id} />
    </div>
  );
}
