// =============================================================================
// src/app/lifting/(dashboard)/dashboard/today/loading.tsx
//
// Skeleton loader for the Today board page — shown while the server fetches
// today's scheduled sessions, readiness check-ins, and weight-room assignments.
// =============================================================================

export default function TodayLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-8 w-64 rounded-xl bg-warm-200" />
          <div className="h-4 w-40 rounded bg-warm-100" />
        </div>
        <div className="h-9 w-28 rounded-xl bg-warm-200" />
      </div>

      {/* Stat tiles row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-white/20 glass-standard p-4 space-y-2"
          >
            <div className="h-8 w-8 rounded-xl bg-warm-200" />
            <div className="h-6 w-12 rounded bg-warm-200" />
            <div className="h-3 w-24 rounded bg-warm-100" />
          </div>
        ))}
      </div>

      {/* Two-column body */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Sessions column (3/5) */}
        <div className="lg:col-span-3 space-y-3">
          <div className="h-5 w-40 rounded bg-warm-200" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-white/20 glass-standard p-4 flex items-center gap-4"
            >
              <div className="h-10 w-10 rounded-full bg-warm-200 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-40 rounded bg-warm-200" />
                <div className="h-3 w-24 rounded bg-warm-100" />
              </div>
              <div className="h-6 w-20 rounded-full bg-warm-200 shrink-0" />
            </div>
          ))}
        </div>

        {/* Readiness column (2/5) */}
        <div className="lg:col-span-2 space-y-3">
          <div className="h-5 w-32 rounded bg-warm-200" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-white/20 glass-standard p-4 flex items-center gap-3"
            >
              <div className="h-9 w-9 rounded-xl bg-warm-200 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-28 rounded bg-warm-200" />
                <div className="h-3 w-16 rounded bg-warm-100" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
