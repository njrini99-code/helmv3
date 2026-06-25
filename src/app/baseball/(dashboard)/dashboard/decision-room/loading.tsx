// Route-level skeleton for the Staff Decision Room. The page is an async server
// component that awaits getDecisionRoomData() before rendering, so without this
// a navigation froze the previous route until the fetch resolved. Mirrors the
// first viewport of StaffDecisionRoomClient (header + 6-stat grid + agenda).

import { Skeleton } from '@/components/ui/skeleton';

export default function DecisionRoomLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      {/* Header + primary export action */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-9 rounded-xl" />
            <Skeleton className="h-8 w-56" />
          </div>
          <Skeleton className="mt-2 h-4 w-72" />
        </div>
        <Skeleton className="h-10 w-32 rounded-xl" />
      </div>

      {/* Stat row — 6 tiles (open-agenda, decisions, staff, insights, availability, conflicts) */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-2xl" />
        ))}
      </div>

      {/* Agenda section */}
      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="space-y-2 lg:col-span-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-2xl lg:col-span-3" />
        </div>
      </section>

      {/* Recent game results skeleton */}
      <section className="mb-8">
        <Skeleton className="mb-3 h-4 w-44" />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      </section>

      {/* Availability + Attendance/Lift skeletons */}
      <section className="mb-8">
        <Skeleton className="mb-3 h-4 w-44" />
        <div className="grid gap-2 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      </section>
    </div>
  );
}
