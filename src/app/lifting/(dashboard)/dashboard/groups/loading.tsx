// =============================================================================
// src/app/lifting/(dashboard)/dashboard/groups/loading.tsx
//
// Skeleton for the Strength Groups page — shown while the server resolves org
// access, then fetches groups + members + the full active-athlete roster in
// parallel. Mirrors StrengthGroupsClient's two-pane shape: LEFT group list,
// CENTER selected-group detail (same panes as that component's own internal
// `StrengthGroupsSkeleton`, reproduced here for the route-level Suspense
// boundary — StrengthGroupsClient.tsx itself is out of scope for this pass).
// =============================================================================

import { Skeleton } from '@/components/ui/skeleton';

export default function GroupsLoading() {
  return (
    <div className="flex h-full min-h-[600px] overflow-hidden" aria-busy="true" aria-label="Loading strength groups">
      {/* LEFT — group list */}
      <aside className="w-64 shrink-0 border-r border-warm-100 bg-warm-50/50 p-3 space-y-2">
        <div className="flex items-center justify-between mb-3 px-1">
          <Skeleton className="h-3.5 w-16 rounded-full" />
          <Skeleton className="h-7 w-14 rounded-lg" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-xl p-3 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-4 w-28 rounded-lg" />
              <Skeleton className="h-4 w-14 rounded-full" />
            </div>
            <Skeleton className="h-3 w-20 rounded-full" />
          </div>
        ))}
      </aside>

      {/* CENTER — selected group's athlete table */}
      <main className="flex-1 p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-6 w-40 rounded-lg" />
            <Skeleton className="h-4 w-24 rounded-full" />
          </div>
          <Skeleton className="h-8 w-20 rounded-lg" />
        </div>
        <div className="rounded-2xl border border-warm-100 glass-standard overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-warm-50 last:border-0">
              <Skeleton className="h-4 w-32 rounded-lg" />
              <Skeleton className="h-4 w-16 rounded-lg" />
              <Skeleton className="h-7 w-20 rounded-lg ml-auto" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
