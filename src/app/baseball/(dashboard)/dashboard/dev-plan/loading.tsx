import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

// Static title-bar skeleton, NOT the live <Header> — Header calls
// useNotifications() unconditionally (before its own redesign-mode branch),
// opening a realtime Supabase subscription on every route-transition mount
// of this skeleton for a screen about to render its own header anyway.
// Mirrors golf's tasks/loading.tsx convention.
export default function Loading() {
  return (
    <>
      <div className="px-4 pt-6 pb-1 sm:px-6 lg:px-8" role="status" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading My Development Plan…</span>
        <Skeleton className="h-8 w-64 rounded-lg" />
        <Skeleton className="mt-2 h-4 w-80 rounded-lg" />
      </div>
      <div className="p-4 md:p-8 space-y-6">
        {/* Progress overview skeleton */}
        <Card variant="glass">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row items-center gap-6">
              {/* Circular progress ring */}
              <Skeleton className="w-28 h-28 rounded-full flex-shrink-0" />
              {/* Stats grid */}
              <div className="flex-1 grid grid-cols-3 gap-4 w-full">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="space-y-2 text-center sm:text-left">
                    <Skeleton className="h-3 w-16 mx-auto sm:mx-0" />
                    <Skeleton className="h-8 w-10 mx-auto sm:mx-0" />
                    <Skeleton className="h-3 w-24 mx-auto sm:mx-0" />
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs skeleton */}
        <Skeleton className="h-12 w-full rounded-xl" />

        {/* Goal cards skeleton */}
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-xl border border-warm-200 p-4 bg-cream-50"
              style={{ opacity: 1 - i * 0.2 }}
            >
              <div className="flex items-start gap-3">
                <Skeleton className="w-6 h-6 rounded-full flex-shrink-0 mt-0.5" />
                <div className="flex-1 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </div>
                  <Skeleton className="h-3 w-1/4" />
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="h-3 w-8" />
                    </div>
                    <Skeleton className="h-2 w-full rounded-full" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
