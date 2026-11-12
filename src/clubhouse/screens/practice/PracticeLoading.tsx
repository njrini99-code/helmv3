'use client';

import { useClubhouseRole, useInClubhouse } from '../../shell/context';
import { SkelRows } from '../../ui/States';
import { PlayerPracticeHomeSkeleton, PlayerPracticePlanSkeleton, PracticeHomeSkeleton, PracticeLibrarySkeleton, PracticePlanSkeleton } from './PracticeSkeletons';

/**
 * A Practice route in waiting, as the page that is coming is shaped: the coach's or the player's (the shell's role is read from
 * context, so this is a client component). Outside the Clubhouse shell the page is on its way to a redirect (practice-gate), and
 * the plain rows it always drew stand in.
 */
export function PracticeLoading({ page }: { page: 'home' | 'drills' | 'groups' | 'templates' | 'plan' }) {
  const inClubhouse = useInClubhouse();
  const player = useClubhouseRole() === 'player';
  if (!inClubhouse) return <SkelRows rows={8} />;
  if (page === 'home') return player ? <PlayerPracticeHomeSkeleton /> : <PracticeHomeSkeleton />;
  if (page === 'plan') return player ? <PlayerPracticePlanSkeleton /> : <PracticePlanSkeleton />;
  return <PracticeLibrarySkeleton tab={page} />;
}
