// Route-level skeleton for the Scout Packets hub (event roster → scout packet).
// The page awaits resolveBaseballCapabilities + getScoutPacketRoster in parallel.
// This skeleton mirrors ScoutPacketRosterList: summary chips + search bar + rows.

import { Skeleton } from '@/components/ui/skeleton';

export default function ScoutPacketsHubLoading() {
  return (
    <div className="min-h-dvh bg-cream-100">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:py-10">
        {/* Page header */}
        <div className="mb-6">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-2 h-9 w-44" />
          <Skeleton className="mt-2 h-4 w-80 max-w-full" />
        </div>

        {/* Summary chips */}
        <div className="mb-4 flex flex-wrap gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-24 rounded-full" />
          ))}
        </div>

        {/* Search bar */}
        <Skeleton className="mb-4 h-11 w-full rounded-xl" />

        {/* Roster rows */}
        <div className="overflow-hidden rounded-2xl border border-warm-200 bg-cream-50 shadow-card">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 border-b border-warm-100 px-4 py-3 last:border-0"
            >
              <Skeleton className="h-9 w-9 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-1">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-4 w-4 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
