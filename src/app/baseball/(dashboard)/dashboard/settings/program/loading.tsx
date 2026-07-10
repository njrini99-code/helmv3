import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';

// Static title-bar skeleton, NOT the live <Header> — Header calls
// useNotifications() unconditionally (before its own redesign-mode branch),
// opening a realtime Supabase subscription on every route-transition mount
// of this skeleton for a screen about to render its own header anyway.
// Shape-matches Header's redesign-mode title bar so there's no layout shift
// when the real page mounts, mirroring golf's tasks/loading.tsx convention.
export default function Loading() {
  return (
    <>
      <div className="px-4 pt-6 pb-1 sm:px-6 lg:px-8" role="status" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading Program Settings…</span>
        <Skeleton className="h-8 w-56 rounded-lg" />
        <Skeleton className="mt-2 h-4 w-80 rounded-lg" />
      </div>
      <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
        {/* Program Type section */}
        <Card variant="glass">
          <CardContent className="p-6 space-y-4">
            <Skeleton className="h-5 w-40 rounded-lg" />
            <Skeleton className="h-4 w-72 rounded-lg" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Program Identity section */}
        <Card variant="glass">
          <CardContent className="p-6 space-y-4">
            <Skeleton className="h-5 w-36 rounded-lg" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Skeleton className="h-12 rounded-xl" />
              <Skeleton className="h-12 rounded-xl" />
              <Skeleton className="h-12 rounded-xl" />
              <Skeleton className="h-12 rounded-xl" />
            </div>
          </CardContent>
        </Card>

        {/* Settings toggles section */}
        <Card variant="glass">
          <CardContent className="p-6 space-y-4">
            <Skeleton className="h-5 w-44 rounded-lg" />
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-warm-100 last:border-0">
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-48 rounded-lg" />
                  <Skeleton className="h-3 w-72 rounded-lg" />
                </div>
                <Skeleton className="h-6 w-10 rounded-full flex-shrink-0" />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Save button area */}
        <div className="flex justify-end">
          <Skeleton className="h-10 w-32 rounded-xl" />
        </div>
      </div>
    </>
  );
}
