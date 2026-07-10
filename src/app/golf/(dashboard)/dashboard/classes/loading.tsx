import { FairwayGolfClassesSkeleton } from '@/components/fairway/pages/player-game/FairwayGolfClassesSkeleton';

export default function Loading() {
  // A Fairway-shaped skeleton mirroring the Classes surface (masthead + 4
  // readouts + the 5-column weekly grid) so the real schedule paints into the
  // same slots with no layout swap / CLS on hydrate.
  return <FairwayGolfClassesSkeleton />;
}
