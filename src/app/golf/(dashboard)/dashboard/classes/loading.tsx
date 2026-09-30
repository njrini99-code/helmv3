'use client';

import { FairwayGolfClassesSkeleton } from '@/components/fairway/pages/player-game/FairwayGolfClassesSkeleton';
import { useClubhouseRole, useInClubhouse } from '@/clubhouse/shell/context';
import { ClassesSkeleton } from '@/clubhouse/screens/classes/ClassesSkeleton';

export default function Loading() {
  // A Fairway-shaped skeleton mirroring the Classes surface (masthead → the
  // today-strip InstrumentPanel row → the week timeline → the 2-column
  // all-classes roster — see FairwayGolfClassesSkeleton.tsx for the full
  // section-by-section breakdown) so the real schedule paints into the same
  // slots with no layout swap / CLS on hydrate.
  //
  // Clubhouse Classes (golf_clubhouse_ui) is the player's page: a player gets its skeleton inside the
  // Clubhouse shell. A coach, in Clubhouse or not, gets the current Fairway page, so its skeleton is the
  // Fairway one. This is a client component because the shell's role is read from context.
  const inClubhouse = useInClubhouse();
  const role = useClubhouseRole();
  return inClubhouse && role === 'player' ? <ClassesSkeleton /> : <FairwayGolfClassesSkeleton />;
}
