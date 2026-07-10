import { ListSkeleton, Skeleton } from '@/components/ui/skeleton';

/**
 * Loading skeleton for the Practice Planner route.
 * Mirrors the real layout (title bar + card list) so there is no layout
 * shift when data lands. Uses the shared ListSkeleton (not a raw spinner).
 *
 * Title bar is a static skeleton, NOT the live <Header> — Header calls
 * useNotifications() unconditionally (before its own redesign-mode branch),
 * opening a realtime Supabase subscription on every route-transition mount
 * of this skeleton for a screen about to render its own header anyway.
 * Mirrors golf's tasks/loading.tsx convention.
 */
export default function Loading() {
  return (
    <>
      <div className="px-4 pt-6 pb-1 sm:px-6 lg:px-8" role="status" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading Practice Planner…</span>
        <Skeleton className="h-8 w-52 rounded-lg" />
        <Skeleton className="mt-2 h-4 w-64 rounded-lg" />
      </div>
      <div className="p-6 lg:p-8">
        <ListSkeleton items={3} />
      </div>
    </>
  );
}
