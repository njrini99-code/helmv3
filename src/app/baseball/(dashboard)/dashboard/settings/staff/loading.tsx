// Route-level skeleton for the Staff & Permissions page. Mirrors the first
// viewport of StaffSettingsClient (header + invite button + roster list).
import { Skeleton } from '@/components/ui/skeleton';

export default function StaffSettingsLoading() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      {/* Back link + header */}
      <div className="mb-6">
        <Skeleton className="mb-3 h-4 w-24" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Skeleton className="h-9 w-56" />
            <Skeleton className="mt-2 h-4 w-72" />
          </div>
          <Skeleton className="h-10 w-32 rounded-xl" />
        </div>
      </div>

      {/* Section label */}
      <Skeleton className="mb-3 h-4 w-28" />

      {/* Staff roster cards */}
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-warm-100 bg-cream-50 p-4"
          >
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div>
                <Skeleton className="mb-1.5 h-4 w-32" />
                <Skeleton className="h-3.5 w-44" />
              </div>
            </div>
            <div className="flex gap-1.5">
              <Skeleton className="h-8 w-20 rounded-xl" />
              <Skeleton className="h-8 w-8 rounded-xl" />
            </div>
            <div className="mt-2 flex w-full flex-wrap gap-1.5">
              {Array.from({ length: 4 }).map((_, j) => (
                <Skeleton key={j} className="h-6 w-24 rounded-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
