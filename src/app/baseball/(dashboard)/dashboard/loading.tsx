import { Skeleton, SkeletonDashboard } from '@/components/ui/skeleton';

// Static title-bar skeleton, NOT the live <Header> — Header calls
// useNotifications() unconditionally (before its own redesign-mode branch),
// opening a realtime Supabase subscription on every route-transition mount
// of this skeleton for a screen about to render its own header anyway.
// Shape-matches Header's redesign-mode title bar (px-4 pt-6 pb-1 sm:px-6
// lg:px-8 → h1/subtitle) so there's no layout shift when the real page
// mounts, mirroring golf's tasks/loading.tsx convention.
export default function DashboardLoading() {
  return (
    <>
      <div className="px-4 pt-6 pb-1 sm:px-6 lg:px-8" role="status" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading Dashboard…</span>
        <Skeleton className="h-8 w-40 rounded-lg" />
        <Skeleton className="mt-2 h-4 w-28 rounded-lg" />
      </div>
      <div className="p-6 lg:p-8">
        <SkeletonDashboard />
      </div>
    </>
  );
}
