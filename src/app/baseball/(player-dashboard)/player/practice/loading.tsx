// Route-level skeleton for Player Practice. The page awaits getPlayerPractices()
// before rendering, so this prevents the previous route from freezing during
// the data fetch. Mirrors the first viewport of PlayerPracticeClient: a header
// strip + two practice-card-shaped blocks.

import { Skeleton } from '@/components/ui/skeleton';

export default function PlayerPracticeLoading() {
  return (
    <div className="min-h-dvh bg-cream-50">
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
        {/* Header */}
        <div className="mb-6">
          <Skeleton className="h-3 w-14" />
          <Skeleton className="mt-2 h-8 w-52" />
          <Skeleton className="mt-2 h-4 w-80 max-w-full" />
        </div>

        {/* Practice cards */}
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="rounded-2xl border border-warm-200 glass-standard p-5 shadow-glass"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="space-y-1.5">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
              <div className="space-y-2">
                {[0, 1, 2].map((j) => (
                  <Skeleton key={j} className="h-10 w-full rounded-xl" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
