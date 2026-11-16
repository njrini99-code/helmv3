import { HubRouteSkeleton } from '@/clubhouse/screens/hub/HubSkeleton';

export default function Loading() {
  // The address's `?tab=` decides the panel the skeleton draws (GAP-S-17).
  return <HubRouteSkeleton />;
}
