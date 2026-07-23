import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';
import { Surface } from '@/components/fairway/surfaces/surface';

/**
 * P206 — the Suspense fallback for the Round detail matches the LIVE Fairway
 * layout: a max-w-[1100px] shell with a ViewHeader masthead, a focal
 * InstrumentCluster (one hero score panel + three tertiary stat panels), then a
 * matte Scorecard Surface.
 */
export default function Loading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto w-full max-w-[1100px] px-4 py-6 md:px-6"
      >
        <span className="sr-only">Loading round…</span>
        <div className="flex flex-col gap-10">
          {/* Masthead (ViewHeader shape) */}
          <div className="flex flex-col gap-3">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-9 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>

          {/* Hero — focal InstrumentCluster: one big score panel + 3 tertiary */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-card border border-border-subtle bg-surface p-6 lg:col-span-1">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-4 h-16 w-32" />
              <Skeleton className="mt-4 h-4 w-20" />
            </div>
            <div className="grid grid-cols-1 gap-4 lg:col-span-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-card border border-border-subtle bg-surface p-5"
                >
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="mt-3 h-8 w-20" />
                  <Skeleton className="mt-4 h-7 w-full rounded-fw-sm" />
                </div>
              ))}
            </div>
          </div>

          {/* Scorecard — forks the same way ScorecardNine does: a vertical
              per-hole row-strip list below md, and the grid-cols-10 table
              only at md and above. */}
          <section className="flex flex-col gap-3">
            <Skeleton className="h-3 w-24" />
            <Surface padding="none" elevation="border" className="overflow-hidden">
              {/* Phone — per-hole row strips */}
              <div className="flex flex-col gap-4 p-5 md:hidden">
                {[0, 1].map((nine) => (
                  <div key={nine} className="flex flex-col gap-2">
                    <div className="flex items-center justify-between px-1">
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="h-3 w-12" />
                    </div>
                    <div className="divide-y divide-border-subtle">
                      {Array.from({ length: 9 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-3 py-2.5">
                          <Skeleton className="h-4 w-6" />
                          <Skeleton className="h-4 w-8" />
                          <Skeleton className="h-5 w-12 rounded-full" />
                          <Skeleton className="ml-auto h-4 w-10" />
                        </div>
                      ))}
                    </div>
                    <Skeleton className="mt-1 h-9 w-full rounded-fw-md" />
                  </div>
                ))}
              </div>

              {/* md+ — the matte table */}
              <div className="hidden space-y-4 p-5 md:block">
                {[0, 1].map((nine) => (
                  <div key={nine} className="space-y-2">
                    <Skeleton className="h-4 w-16" />
                    <div className="grid grid-cols-10 gap-2">
                      {Array.from({ length: 10 }).map((_, i) => (
                        <Skeleton key={i} className="h-6 w-full" />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Surface>
          </section>
        </div>
      </div>
    </div>
  );
}

