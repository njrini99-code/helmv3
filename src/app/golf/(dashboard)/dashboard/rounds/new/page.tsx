import { getGolfSessionProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import NewRoundClient from './new-round-client';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';

export default async function NewRoundPage() {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  const { player } = session;
  if (!player) redirect('/golf/dashboard?message=Only players can submit rounds');

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
