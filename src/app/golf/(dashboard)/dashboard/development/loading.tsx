import { PlayersGridSkeleton } from '@/components/fairway/pages/coachhelm/PlayersGridSkeleton';

// A Fairway-shaped skeleton mirroring the live PlayersGridView (masthead
// instrument-cluster + segmented + primary header actions + a DataTable-shaped
// roster body) so the real surface paints into the same slots with no layout
// swap / CLS on hydrate.
export default function Loading() {
  return <PlayersGridSkeleton />;
}
