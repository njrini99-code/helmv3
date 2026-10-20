import { getGolfSessionProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import NewRoundClient from './new-round-client';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';
import { FeatureUnavailable } from '@/components/fairway';
import { isClubhouseFor } from '@/clubhouse/gate';
import { getGolfDashboardRole } from '@/lib/auth/get-golf-dashboard-role';
import { ClubhouseNewRoundRoute } from '@/clubhouse/routes/round-new';
import { dataGapAsksForShotEntry } from '@/lib/coachhelm/data-gap/load-asks';

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

  // Clubhouse round entry (golf_clubhouse_ui): setup, then the round, over the same new-round engine.
  // The role is the dashboard layout's (getGolfDashboardRole); Fairway below keeps the session's.
  if ((await isClubhouseFor('player')) && (await getGolfDashboardRole()) === 'player') return <ClubhouseNewRoundRoute playerId={player.id} />;

  // Note: unfinished / in-progress rounds are surfaced on the /rounds page
  // (UnfinishedRoundsSection), not gated here — the New Round page deliberately
  // does NOT fetch the in-progress round, because the in-flow resume prompt was
  // never shown (its result was discarded). Starting a New Round lands straight
  // on the course carousel.

  // CoachHelm Slice 8a: the one-tap data-gap asks (undefined with
  // coachhelm_data_gap_prompt_v1 off, so nothing is read or passed).
  const dataGapAsks = await dataGapAsksForShotEntry(player.id);

  return (
    <AnimatedPage>
      <AnimatedItem>
        <NewRoundClient playerId={player.id} dataGapAsks={dataGapAsks} />
      </AnimatedItem>
    </AnimatedPage>
  );
}
