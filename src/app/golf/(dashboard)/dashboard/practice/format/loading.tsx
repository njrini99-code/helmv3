import { CoachHelmRouteSkeleton } from '@/clubhouse/screens/coachhelm/CoachHelmSkeleton';

/** Route Suspense fallback for Plan format: the page only exists on Clubhouse, behind its flag. */
export default function Loading() {
  return <CoachHelmRouteSkeleton />;
}
