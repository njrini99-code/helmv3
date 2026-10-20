import { FairwayRosterSkeleton } from '@/components/fairway/pages/roster/FairwayRosterSkeleton';
import { ClubhouseSwitch } from '@/clubhouse/shell/ClubhouseSwitch';
import { RosterSkeleton } from '@/clubhouse/screens/roster/RosterSkeleton';

export default function Loading() {
  // Fairway-shaped skeleton that mirrors the live 2-col card grid
  // (avatar + name/year + chips + Avg Score plinth + full-width CTA) so the
  // real roster paints into the same slots with no layout swap / CLS on
  // hydrate. Inside the Clubhouse shell, the Clubhouse roster skeleton.
  return <ClubhouseSwitch clubhouse={<RosterSkeleton />} fallback={<FairwayRosterSkeleton />} />;
}
