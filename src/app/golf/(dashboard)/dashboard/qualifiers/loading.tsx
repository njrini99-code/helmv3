import { fairwayScope } from '@/lib/redesign/flag';
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

export default function Loading() {
  return <FairwayQualifiersLoading />;
}
