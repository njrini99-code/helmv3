import { isRedesignEnabled, fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';
import { Surface } from '@/components/fairway/surfaces/surface';

/**
 * P206 — the Suspense fallback for the Round detail must match the LIVE Fairway
 * layout: a max-w-[1100px] shell with a ViewHeader masthead, a focal
 * InstrumentCluster (one hero score panel + three tertiary stat panels), then a
 * matte Scorecard Surface — NOT the legacy scorecard-table skeleton (which only
 * matches the flag-off page and stays behind the flag). isRedesignEnabled() is
 * build-time-inlined and safe to read in a loading boundary.
 */
function FairwayRoundDetailLoading() {
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

          {/* Scorecard */}
          <section className="flex flex-col gap-3">
            <Skeleton className="h-3 w-24" />
            <Surface padding="none" elevation="border" className="overflow-hidden">
              <div className="space-y-4 p-5">
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

function LegacyRoundDetailLoading() {
  return (
    <div className="p-6 max-w-[1280px] mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="h-9 w-20 bg-warm-100/60 rounded-lg skeleton-shimmer" />
        <div className="flex-1">
          <div className="h-8 w-64 bg-warm-200/60 rounded-lg skeleton-shimmer mb-2" />
          <div className="h-5 w-32 bg-warm-100/60 rounded skeleton-shimmer" />
        </div>
        <div className="h-9 w-32 bg-warm-200/60 rounded-lg skeleton-shimmer" />
      </div>

      {/* Round Summary Card */}
      <div className="surface-matte rounded-3xl overflow-clip mb-6">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex-1">
              <div className="flex items-center gap-4 mb-3">
                <div className="h-6 w-48 bg-warm-200/60 rounded skeleton-shimmer" />
                <div className="h-6 w-20 bg-warm-100/60 rounded skeleton-shimmer" />
                <div className="h-6 w-16 bg-warm-100/60 rounded skeleton-shimmer" />
              </div>
              <div className="flex items-center gap-6">
                <div className="h-4 w-32 bg-warm-100/60 rounded skeleton-shimmer" />
                <div className="h-4 w-32 bg-warm-100/60 rounded skeleton-shimmer" />
              </div>
              <div className="flex items-center gap-4 mt-2">
                <div className="h-4 w-24 bg-warm-100/60 rounded skeleton-shimmer" />
                <div className="h-4 w-24 bg-warm-100/60 rounded skeleton-shimmer" />
              </div>
            </div>
            <div className="text-right">
              <div className="h-14 w-20 bg-warm-200/60 rounded-lg skeleton-shimmer mb-2" />
              <div className="h-8 w-16 bg-warm-100/60 rounded skeleton-shimmer" />
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-6 border-t border-warm-200">
            {[1, 2, 3, 4].map((i) => (
              <div key={i}>
                <div className="h-4 w-24 bg-warm-100/60 rounded skeleton-shimmer mb-2" />
                <div className="h-8 w-16 bg-warm-200/60 rounded skeleton-shimmer mb-1" />
                <div className="h-3 w-12 bg-warm-100/60 rounded skeleton-shimmer" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Scorecard */}
      <div className="surface-matte rounded-3xl overflow-clip">
        <div className="p-4 border-b border-warm-200">
          <div className="h-6 w-32 bg-warm-200/60 rounded skeleton-shimmer" />
        </div>
        <div className="p-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-warm-200">
                  <th className="text-left py-3 px-3"><div className="h-4 w-12 bg-warm-100/60 rounded skeleton-shimmer" /></th>
                  <th className="text-center py-3 px-3"><div className="h-4 w-8 bg-warm-100/60 rounded skeleton-shimmer mx-auto" /></th>
                  <th className="text-center py-3 px-3"><div className="h-4 w-12 bg-warm-100/60 rounded skeleton-shimmer mx-auto" /></th>
                  <th className="text-center py-3 px-3"><div className="h-4 w-8 bg-warm-100/60 rounded skeleton-shimmer mx-auto" /></th>
                  <th className="text-center py-3 px-3"><div className="h-4 w-12 bg-warm-100/60 rounded skeleton-shimmer mx-auto" /></th>
                  <th className="text-center py-3 px-3"><div className="h-4 w-8 bg-warm-100/60 rounded skeleton-shimmer mx-auto" /></th>
                  <th className="text-center py-3 px-3"><div className="h-4 w-8 bg-warm-100/60 rounded skeleton-shimmer mx-auto" /></th>
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
                  <tr key={i} className="border-b border-warm-100">
                    <td className="py-3 px-3"><div className="h-4 w-4 bg-warm-100/60 rounded skeleton-shimmer" /></td>
                    <td className="text-center py-3 px-3"><div className="h-4 w-4 bg-warm-100/60 rounded skeleton-shimmer mx-auto" /></td>
                    <td className="text-center py-3 px-3"><div className="h-4 w-4 bg-warm-100/60 rounded skeleton-shimmer mx-auto" /></td>
                    <td className="text-center py-3 px-3"><div className="h-4 w-6 bg-warm-100/60 rounded skeleton-shimmer mx-auto" /></td>
                    <td className="text-center py-3 px-3"><div className="h-4 w-4 bg-warm-100/60 rounded skeleton-shimmer mx-auto" /></td>
                    <td className="text-center py-3 px-3"><div className="h-4 w-4 bg-warm-100/60 rounded skeleton-shimmer mx-auto" /></td>
                    <td className="text-center py-3 px-3"><div className="h-4 w-4 bg-warm-100/60 rounded skeleton-shimmer mx-auto" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Loading() {
  if (isRedesignEnabled()) return <FairwayRoundDetailLoading />;
  return <LegacyRoundDetailLoading />;
}
