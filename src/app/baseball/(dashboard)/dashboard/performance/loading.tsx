// Route-level skeleton for the Performance Command Center. Mirrors
// PerformanceCommandCenter's real first viewport (SectionMasthead, KPI
// contents strip on a ruled baseline, Today Weight Room board + readiness
// queue) on the same Living Annual tokens (--paper/--hairline/rounded-card)
// as the page itself, so there is no layout shift when data lands.

import { Skeleton } from '@/components/ui/skeleton';

export default function PerformanceLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6">
      {/* Masthead */}
      <div>
        <Skeleton className="h-3 w-40" />
        <div className="mt-2 flex items-start justify-between gap-4">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-9 w-40 rounded-fw-sm" />
        </div>
        <Skeleton className="mt-3 h-[3px] w-16 rounded-full" />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <Skeleton className="h-3 w-56 max-w-full" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-24 rounded-fw-sm" />
            <Skeleton className="h-8 w-24 rounded-fw-sm" />
            <Skeleton className="h-8 w-24 rounded-fw-sm" />
          </div>
        </div>
      </div>

      {/* KPI contents strip */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-px w-full" />
          </div>
        ))}
      </div>

      {/* Today Weight Room board + readiness queue */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] p-5 lg:col-span-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="mt-2 h-3 w-52 max-w-full" />
          <div className="mt-4 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-fw-sm" />
            ))}
          </div>
        </div>
        <div className="rounded-card border border-[color:var(--hairline)] bg-[var(--paper)] p-5">
          <Skeleton className="h-3 w-28" />
          <div className="mt-4 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-fw-sm" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
