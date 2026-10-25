import { CourseHistorySkeleton } from '@/clubhouse/screens/rounds/RoundsSkeleton';

/** P-7: the course page is Clubhouse only, so its fallback is Clubhouse's. */
export default function Loading() {
  return <CourseHistorySkeleton />;
}
