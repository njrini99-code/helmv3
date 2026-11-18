import { RoundRuntimeSkeleton } from '@/clubhouse/screens/rounds/RoundsSkeleton';

/** A round to continue opens on the tracking screen, so its loading is that screen's boxes, not the entry form's (GAP-S-18). */
export default function Loading() {
  return <RoundRuntimeSkeleton />;
}
