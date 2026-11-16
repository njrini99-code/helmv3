'use client';

import { useRouter } from 'next/navigation';
import { useChPhone } from '../../lib/use-phone';
import { useClubhouseRole, useInClubhouse } from '../../shell/context';
import { PhoneTop } from '../../shell/phone-chrome';
import { SkelRows } from '../../ui/States';
import { PlayerPracticeHomeSkeleton, PlayerPracticePlanSkeleton, PracticeDrillSkeleton, PracticeHomeSkeleton, PracticeLibrarySkeleton, PracticePlanSkeleton } from './PracticeSkeletons';

/**
 * A Practice route in waiting, as the page that is coming is shaped: the coach's or the player's (the shell's role is read from
 * context, so this is a client component). Outside the Clubhouse shell the page is on its way to a redirect (practice-gate), and
 * the plain rows it always drew stand in.
 */
export function PracticeLoading({ page }: { page: 'home' | 'drills' | 'groups' | 'templates' | 'plan' | 'drill' }) {
  const inClubhouse = useInClubhouse();
  const player = useClubhouseRole() === 'player';
  const phone = useChPhone();
  const router = useRouter();
  if (!inClubhouse) return <SkelRows rows={8} />;
  if (page === 'drill') {
    // The drill's bar is the loaded page's (LibraryPages DrillPage), so the push shows it from its first frame (MAC-04).
    return (
      <>
        {phone && <PhoneTop title="Drill" back={{ label: 'Drills', onBack: () => router.push('/golf/dashboard/practice/drills') }} />}
        <PracticeDrillSkeleton />
      </>
    );
  }
  if (page === 'home') return player ? <PlayerPracticeHomeSkeleton /> : <PracticeHomeSkeleton />;
  if (page === 'plan') return player ? <PlayerPracticePlanSkeleton /> : <PracticePlanSkeleton />;
  return <PracticeLibrarySkeleton tab={page} />;
}
