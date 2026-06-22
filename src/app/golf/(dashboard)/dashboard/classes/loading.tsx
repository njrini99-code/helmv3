import { ClassesPageSkeleton } from '@/components/ui/skeleton';
import { isRedesignEnabled } from '@/lib/redesign/flag';
import { FairwayGolfClassesSkeleton } from '@/components/fairway/pages/player-game/FairwayGolfClassesSkeleton';

export default function Loading() {
  // Flag ON → a Fairway-shaped skeleton mirroring the redesigned Classes surface
  // (masthead + 4 readouts + the 5-column weekly grid) so the real schedule
  // paints into the same slots with no layout swap / CLS on hydrate.
  // Flag OFF → the legacy ClassesPageSkeleton verbatim.
  if (isRedesignEnabled()) return <FairwayGolfClassesSkeleton />;
  return <ClassesPageSkeleton />;
}
