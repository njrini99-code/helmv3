import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

// Static title-bar skeleton, NOT the live <Header> — Header calls
// useNotifications() unconditionally (before its own redesign-mode branch),
// opening a realtime Supabase subscription on every route-transition mount
// of this skeleton for a screen about to render its own header anyway.
// Wrapped in the same `mx-auto w-full max-w-[880px] px-4 py-8 sm:px-6
// lg:py-10` shell DevPlanClient's real masthead + content render inside, so
// the column doesn't snap narrower once real data mounts (mirrors golf's
// tasks/loading.tsx convention for the header treatment itself).
export default function Loading() {
  return (
    <div
      className="mx-auto w-full max-w-[880px] px-4 py-8 sm:px-6 lg:py-10"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading My Development Plan…</span>
      <Skeleton className="h-3 w-48 rounded-lg" />
      <Skeleton className="mt-3 h-8 w-64 rounded-lg" />
      <Skeleton className="mt-2 h-4 w-80 rounded-lg" />

      <div className="mt-8 space-y-6">
        {/* Progress overview skeleton — RuledStatLine-shaped (label + numeric
            row), never a ring: the real "Progress" card shows completion as
            text via RuledStatLine, not a circular gauge. */}
        <Card variant="glass">
          <CardContent className="p-6">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-3 h-9 w-16" />
            <div className="mt-8 grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-7 w-10" />
                </div>
              ))}
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
    </div>
  );
}
