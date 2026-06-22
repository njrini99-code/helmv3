import { isRedesignEnabled, fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';
import { Surface } from '@/components/fairway/surfaces/surface';

/**
 * P324 — the Suspense fallback for the Qualifiers library must match the LIVE
 * Fairway layout, not the legacy cream/glass chrome. The previous skeleton used
 * `warm-*` / `cream-*` / `surface-matte` / `skeleton-shimmer` tokens, so the
 * load→content transition jumped from glass chrome to the bg-canvas matte
 * Fairway surfaces. This reserves the ACTUAL FairwayQualifiers layout:
 * a max-w-[1280px] shell with a ViewHeader-shaped title row + action, the
 * soft-lit hero Surface, the status FilterPills + search row, then the two-up
 * Surface card grid. Tokens only (bg-canvas, Surface/Skeleton primitives).
 * isRedesignEnabled() is build-time-inlined and safe to read in a loading
 * boundary; the legacy fallback (max-w-[1280px] cream chrome) stays gated off.
 */
function FairwayQualifiersLoading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto w-full max-w-[1280px] px-4 py-6 md:px-6 md:py-8"
      >
        <span className="sr-only">Loading qualifiers…</span>

        {/* ViewHeader-shaped title row + primary action */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-44" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-10 w-36 rounded-card" />
        </div>

        {/* Hero — soft-lit active/upcoming qualifier */}
        <div className="mt-8">
          <Surface elevation="shadow" padding="lg">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-4">
                <Skeleton className="h-6 w-56" />
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-3/5 sm:col-span-2" />
              </div>
            </div>
          </Surface>
        </div>

        {/* Status filter pills + search row */}
        <div className="mt-8 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {[20, 16, 18, 16].map((w, i) => (
              <Skeleton key={i} className="h-8 rounded-full" style={{ width: `${w * 4}px` }} />
            ))}
          </div>
          <div className="max-w-md">
            <Skeleton className="h-10 w-full rounded-card" />
          </div>
        </div>

        {/* Two-up Surface card grid */}
        <div className="mt-8 grid grid-cols-1 gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Surface key={i} elevation="border" padding="lg">
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-4">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </Surface>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Legacy (flag-off) fallback — kept token-matched to the flag-off page so it
 * stays accurate there. Renders only when the redesign flag is off.
 */
function LegacyQualifiersLoading() {
  return (
    <div className="min-h-full">
      {/* Header Skeleton */}
      <div className="border-b border-warm-200/60 bg-cream-100/60 backdrop-blur-sm">
        <div className="max-w-[1280px] mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="h-8 w-40 bg-warm-200/60 rounded-lg skeleton-shimmer mb-2" />
              <div className="h-4 w-32 bg-warm-100/60 rounded skeleton-shimmer" />
            </div>
            <div className="h-10 w-32 bg-warm-200/60 rounded-lg skeleton-shimmer" />
          </div>
        </div>
      </div>

      {/* Content Skeleton */}
      <div className="max-w-[1280px] mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="surface-matte rounded-3xl overflow-clip p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="h-6 w-48 bg-warm-200/60 rounded skeleton-shimmer mb-2" />
                  <div className="h-4 w-full bg-warm-100/60 rounded skeleton-shimmer" />
                </div>
                <div className="h-6 w-20 bg-warm-100/60 rounded-full skeleton-shimmer" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="h-4 w-full bg-warm-100/60 rounded skeleton-shimmer" />
                <div className="h-4 w-full bg-warm-100/60 rounded skeleton-shimmer" />
              </div>
              <div className="mt-4 pt-4 border-t border-warm-100">
                <div className="h-4 w-24 bg-warm-100/60 rounded skeleton-shimmer" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Loading() {
  if (isRedesignEnabled()) return <FairwayQualifiersLoading />;
  return <LegacyQualifiersLoading />;
}
