// =============================================================================
// src/app/lifting/(dashboard)/dashboard/import/loading.tsx
//
// Skeleton loader for the Import page — shown while the server resolves org
// access and recent import runs.
// =============================================================================

export default function ImportLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-8 w-48 rounded-xl bg-warm-200" />
          <div className="h-4 w-64 rounded bg-warm-100" />
        </div>
      </div>

      {/* Upload card skeleton */}
      <div className="rounded-2xl border border-white/20 glass-standard p-6 space-y-4">
        <div className="h-5 w-40 rounded bg-warm-200" />
        {/* Drop zone */}
        <div className="rounded-xl border-2 border-dashed border-warm-200 p-10 flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-warm-200" />
          <div className="h-4 w-56 rounded bg-warm-200" />
          <div className="h-3 w-40 rounded bg-warm-100" />
        </div>
        {/* Format selectors */}
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-8 w-24 rounded-lg bg-warm-200" />
          ))}
        </div>
      </div>

      {/* Recent imports table skeleton */}
      <div className="rounded-2xl border border-white/20 glass-standard p-5 space-y-4">
        <div className="h-5 w-36 rounded bg-warm-200" />
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3 glass-standard rounded-xl">
              <div className="h-8 w-8 rounded-lg bg-warm-200 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-48 rounded bg-warm-200" />
                <div className="h-3 w-32 rounded bg-warm-100" />
              </div>
              <div className="h-6 w-20 rounded-full bg-warm-200" />
              <div className="h-8 w-20 rounded-lg bg-warm-200 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
