import { FairwayGolfClassesSkeleton } from '@/components/fairway/pages/player-game/FairwayGolfClassesSkeleton';

export default function Loading() {
  // A Fairway-shaped skeleton mirroring the Classes surface (masthead → the
  // today-strip InstrumentPanel row → the week timeline → the 2-column
  // all-classes roster — see FairwayGolfClassesSkeleton.tsx for the full
  // section-by-section breakdown) so the real schedule paints into the same
  // slots with no layout swap / CLS on hydrate.
  return <FairwayGolfClassesSkeleton />;
}
