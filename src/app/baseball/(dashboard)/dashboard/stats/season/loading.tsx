import { Skeleton } from '@/components/ui/skeleton';

/**
 * Season stats loading skeleton — mirrors the real layout:
 * page header → stats table (batting/pitching tabs + sortable rows)
 * → recent games section.
 */
export default function SeasonStatsLoading() {
  return (
    <div className="mx-auto max-w-[1536px] px-4 py-8 sm:px-6 space-y-8">
      {/* Page header */}
      <div className="space-y-1.5">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-80" />
      </div>

      {/* Table controls (tab bar + season picker + export) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex gap-1 p-1 bg-warm-100 rounded-xl">
            <Skeleton className="h-8 w-24 rounded-lg" />
            <Skeleton className="h-8 w-24 rounded-lg" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-24 rounded-lg" />
            <Skeleton className="h-8 w-24 rounded-lg" />
          </div>
        </div>

        {/* Table skeleton */}
        <div className="rounded-2xl bg-white/70 border border-warm-100 overflow-hidden">
          {/* Header row */}
          <div className="flex gap-2 px-4 py-3 border-b border-warm-100 bg-warm-50/80">
            <Skeleton className="h-4 w-32" />
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-10 flex-shrink-0" />
            ))}
          </div>
          {/* Data rows */}
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="flex gap-2 px-4 py-2.5 border-b border-warm-50 last:border-b-0">
              <Skeleton className="h-4 w-32 flex-shrink-0" />
              {Array.from({ length: 10 }).map((_, j) => (
                <Skeleton key={j} className="h-4 w-10 flex-shrink-0" />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Recent games section */}
      <div className="space-y-4">
        <Skeleton className="h-6 w-32" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-2xl bg-white/70 border border-warm-100 p-4 flex items-center justify-between gap-4">
            <div className="space-y-1.5">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-3.5 w-28" />
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
