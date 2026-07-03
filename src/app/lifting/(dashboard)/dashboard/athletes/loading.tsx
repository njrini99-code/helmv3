// =============================================================================
// src/app/lifting/(dashboard)/dashboard/athletes/loading.tsx
//
// Skeleton loader for the Athlete Roster page — shown while the server fetches
// helm_lifting_athletes. Approximates the header bar + athlete card grid with
// animated pulse skeletons.
// =============================================================================

export default function AthletesLoading() {
  return (
    <div className="space-y-6 p-6 animate-pulse">
      {/* Header bar skeleton */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-48 rounded-xl bg-warm-200" />
        <div className="h-9 w-32 rounded-xl bg-warm-200" />
      </div>

      {/* Sport-filter tab bar skeleton */}
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-8 w-24 rounded-lg bg-warm-200" />
        ))}
      </div>

      {/* Athlete card grid skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl glass-standard p-5 space-y-3"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-warm-200 shrink-0" />
              <div className="space-y-1.5 flex-1">
                <div className="h-4 w-32 rounded bg-warm-200" />
                <div className="h-3 w-20 rounded bg-warm-100" />
              </div>
            </div>
            <div className="h-3 w-full rounded bg-warm-100" />
            <div className="h-3 w-3/4 rounded bg-warm-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
