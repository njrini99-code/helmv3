import { DashboardSkeleton } from '@/components/golf/GolfSkeletons';

/**
 * Loading UI for the golf dashboard layout.
 * Shown by Next.js during server-side rendering of the layout
 * (e.g., on initial navigation to /golf/dashboard).
 */
export default function GolfDashboardLoading() {
  return <DashboardSkeleton />;
}
