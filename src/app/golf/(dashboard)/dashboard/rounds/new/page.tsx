import { getGolfSessionProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import NewRoundClient from './new-round-client';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';
import { FeatureUnavailable } from '@/components/fairway';

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

  // Note: unfinished / in-progress rounds are surfaced on the /rounds page
  // (UnfinishedRoundsSection), not gated here — the New Round page deliberately
  // does NOT fetch the in-progress round, because the in-flow resume prompt was
  // never shown (its result was discarded). Starting a New Round lands straight
  // on the course carousel.

  return (
    <AnimatedPage>
      <AnimatedItem>
        <NewRoundClient />
      </AnimatedItem>
    </AnimatedPage>
  );
}
