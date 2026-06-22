import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton, SkeletonCard } from '@/components/fairway/feedback';

/**
 * Route-level loading fallback for the coach Recruiting HQ view.
 *
 * Fairway-native (warm `--fw-*` skeleton blocks, not the legacy ui/skeleton set)
 * so the skeleton→page swap is seamless instead of flashing legacy chrome. Wrapped
 * in the same `fairwayScope('min-h-full bg-canvas')` frame + `max-w-[1200px]`
 * column the page itself uses, and shape-matched to FairwayRecruitingPage:
 * ViewHeader masthead (eyebrow / title / description / Add CTA) → the funnel
 * snapshot plate grid (2-up → 4-up) → the search + sort toolbar → the
 * md:grid-cols-2 xl:grid-cols-3 prospect-card grid. Tokens only
 * (bg-canvas/Surface/border-subtle) so there is no theme jump or CLS.
 */
export default function Loading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6 md:py-8"
      >
        <span className="sr-only">Loading your prospect list…</span>

        {/* Masthead — eyebrow / title / description + Add-prospect CTA (ViewHeader). */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-9 w-52" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>
          <Skeleton className="h-10 w-36 rounded-full" />
        </div>

        {/* Funnel snapshot — one stat plate per status (2-up → 4-up). */}
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col items-start gap-2 rounded-card border border-border-subtle bg-surface p-4"
            >
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-8 w-10" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>

        {/* Toolbar — search field + sort segmented control. */}
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center">
          <Skeleton className="h-11 w-full rounded-fw-md md:flex-1" />
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-9 w-16 rounded-full" />
            <Skeleton className="h-9 w-56 rounded-full" />
          </div>
        </div>

        {/* Prospect card grid — 1-up → 2-up → 3-up. */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} lines={3} />
          ))}
        </div>
      </div>
    </div>
  );
}
