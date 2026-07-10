// =============================================================================
// src/app/lifting/(dashboard)/dashboard/loading.tsx
//
// Generic skeleton for the Lift Lab home (and the fallback boundary for any
// nested `dashboard/**` leaf that doesn't define its own `loading.tsx` — e.g.
// sessions, exercises, readiness, check-ins, command). The Lab chrome
// (sidebar / mobile top bar from `LabShell`) is already mounted by the
// `(dashboard)/layout.tsx` above this segment and stays on screen — this file
// only covers the `<main>` content area.
//
// Shaped to match the CURRENT `page.tsx` (rewritten in the same commit as
// this file): a `SectionMasthead`-style header (eyebrow dateline + title +
// green accent rule, not a plain title/subtitle pair), the `SportTabBar`,
// ONE flat KPI card holding a `RuledStatLine` grid (NOT four separate raised
// stat cards — the page dropped that shape when it moved to the Living
// Annual `RuledStatLine` atom), and a two-column body of flat cards
// ("Covered teams" / "Your access" + "Quick actions").
// =============================================================================

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function LiftingDashboardLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading Lift Lab dashboard">
      {/* Masthead — eyebrow dateline, title + actions row, green accent rule */}
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-56 rounded-full" />
        <div className="flex items-start justify-between gap-4">
          <Skeleton className="h-8 w-40 rounded-xl" />
          <Skeleton className="h-9 w-36 rounded-xl" />
        </div>
        <Skeleton className="h-[3px] w-16 rounded-full" />
      </div>

      {/* Sport filter tabs */}
      <div className="flex items-center gap-1 p-1 glass-subtle rounded-2xl border border-white/20 w-fit">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-xl m-0.5" />
        ))}
      </div>

      {/* KPI strip — ONE flat card, a RuledStatLine-shaped grid (label / numeral
          / baseline rule per column), not four separate raised stat cards. */}
      <Card variant="flat" noPadding className="p-5 sm:p-6">
        <div className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <Skeleton className="h-3 w-20 rounded-full" />
              <Skeleton className="h-8 w-14 rounded-lg" />
              <Skeleton className="h-[1.5px] w-full rounded-full" />
            </div>
          ))}
        </div>
      </Card>

      {/* Two-column body */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Covered teams / access */}
        <div className="lg:col-span-1">
          <Card variant="flat" noPadding className="p-5">
            <div className="mb-4">
              <Skeleton className="h-3.5 w-28 rounded-full" />
            </div>
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 glass-standard rounded-xl">
                  <Skeleton className="h-5 w-5 rounded" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-24 rounded-full" />
                    <Skeleton className="h-3 w-16 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Quick actions */}
        <div className="lg:col-span-2">
          <Card variant="flat" noPadding className="p-5">
            <div className="mb-4">
              <Skeleton className="h-3.5 w-28 rounded-full" />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-4 glass-standard rounded-xl">
                  <Skeleton variant="circular" className="h-10 w-10 shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-28 rounded-full" />
                    <Skeleton className="h-3 w-36 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
