import { Skeleton } from '@/components/ui/skeleton';

// Mirrors LiveWeightRoomClient's own internal loading skeleton exactly — no
// right rail (the desktop `<aside>` detail panel only mounts once an athlete
// is selected, and `selectedAthleteId` starts `null` on every fresh load, so
// it is never present on initial paint) — and the same shell-aware height
// formula the real component uses instead of a flat `min-h-screen` guess.
const SHELL_AWARE_HEIGHT =
  'h-[calc(100dvh-var(--golf-mobile-header-offset)-var(--golf-mobile-bottom-nav-offset)-var(--baseball-hub-subnav-offset,0px))]';

export default function Loading() {
  return (
    <div className={`flex ${SHELL_AWARE_HEIGHT} flex-col bg-[#FFFEFA]`}>
      {/* Sticky header skeleton */}
      <header className="sticky top-0 z-20 border-b border-warm-100 glass-standard backdrop-blur-xl px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-5 rounded" />
              <Skeleton className="h-5 w-40" />
            </div>
            <div className="hidden items-center gap-4 sm:flex">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
            </div>
          </div>
          <Skeleton className="h-8 w-20 rounded-lg" />
        </div>
        {/* Group tabs skeleton */}
        <div className="mt-2 flex items-center gap-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-16 rounded-full" />
          ))}
        </div>
      </header>
      {/* Athlete grid skeleton */}
      <main className="flex-1 overflow-y-auto p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="space-y-3 rounded-2xl border border-warm-100 glass-standard p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-10" />
                </div>
                <Skeleton className="h-1.5 w-full rounded-full" />
              </div>
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-14 rounded-full" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
