import { DevelopmentPageSkeleton } from '@/components/ui/skeleton';
import { isRedesignEnabled } from '@/lib/redesign/flag';
import { PlayersGridSkeleton } from '@/components/fairway/pages/coachhelm/PlayersGridSkeleton';

export default function Loading() {
  // Flag ON → a Fairway-shaped skeleton mirroring the live PlayersGridView
  // (masthead instrument-cluster + segmented + primary header actions + a
  // DataTable-shaped roster body) so the real surface paints into the same
  // slots with no layout swap / CLS on hydrate.
  // Flag OFF → the legacy DevelopmentPageSkeleton verbatim.
  if (isRedesignEnabled()) return <PlayersGridSkeleton />;
  return <DevelopmentPageSkeleton />;
}
