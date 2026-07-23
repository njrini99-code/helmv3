// Route-level skeleton for the Staff Decision Room. The page is an async server
// component that awaits getDecisionRoomData() before rendering, so without this
// a navigation froze the previous route until the fetch resolved. Mirrors the
// first viewport of StaffDecisionRoomFairway (the Living Annual migration,
// P4.23) — max-w-[1400px] shell, SectionMasthead (eyebrow + title + accent
// rule + export action), the RuledStatLine 2/3/6-col stat strip, and the
// two-pane meeting-mode agenda (list + detail) — not the pre-migration
// icon-header/boxy-tiles/game-results/availability layout this used to depict.

import { Skeleton } from '@/components/ui/skeleton';

export default function DecisionRoomLoading() {
  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
      {/* SectionMasthead — eyebrow + title + lede + accent rule + export action */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-3">
            <Skeleton className="h-3 w-48" />
            <Skeleton className="h-9 w-56" />
          </div>
          <Skeleton className="h-9 w-36 rounded-fw-sm" />
        </div>
        <Skeleton className="h-[3px] w-16 rounded-full" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>

      {/* Stat strip — 6 ruled figures (open-agenda, decisions, staff, insights, availability, conflicts) */}
      <div className="mt-8 grid grid-cols-2 gap-x-8 gap-y-7 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-9 w-10" />
            <Skeleton className="h-[1.5px] w-full" />
          </div>
        ))}
      </div>

      {/* Agenda pane — list (left) + detail (right) */}
      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="flex flex-col gap-2 lg:col-span-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-card" />
            ))}
          </div>
          <div className="lg:col-span-3">
            <Skeleton className="h-72 rounded-card" />
          </div>
        </div>
      </section>
    </div>
  );
}
