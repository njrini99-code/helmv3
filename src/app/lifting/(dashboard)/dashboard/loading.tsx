// =============================================================================
// src/app/lifting/(dashboard)/dashboard/loading.tsx
//
// Generic skeleton for the Lift Lab home (and the fallback boundary for any
// nested `dashboard/**` leaf that doesn't define its own `loading.tsx` — e.g.
// sessions, exercises, readiness, check-ins, command). The Lab chrome
// (sidebar / mobile top bar from `LabShell`) is already mounted by the
// `(dashboard)/layout.tsx` above this segment and stays on screen — this file
// only covers the `<main>` content area, shaped to match the dashboard home's
// header + sport tabs + stat grid + two-column body so nav doesn't blank-flash
// while the page's several sequential Supabase awaits resolve.
// =============================================================================

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function LiftingDashboardLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading Lift Lab dashboard">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56 rounded-xl" />
          <Skeleton className="h-4 w-40 rounded-full" />
        </div>
        <Skeleton className="h-9 w-36 rounded-xl" />
      </div>

      {/* Sport filter tabs */}
      <div className="flex items-center gap-1 p-1 glass-subtle rounded-2xl border border-white/20 w-fit">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-xl m-0.5" />
        ))}
      </div>

      {/* Quick-stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} variant="raised" noPadding className="p-5">
            <Skeleton variant="circular" className="h-10 w-10 mb-4" />
            <Skeleton className="h-7 w-12 rounded-lg mb-1.5" />
            <Skeleton className="h-3.5 w-20 rounded-full" />
          </Card>
        ))}
      </div>

      {/* Two-column body */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Covered teams / access */}
        <div className="lg:col-span-1">
          <Card variant="raised" noPadding className="p-5">
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
          <Card variant="raised" noPadding className="p-5">
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
