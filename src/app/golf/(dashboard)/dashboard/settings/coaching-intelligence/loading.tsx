import { Skeleton } from '@/components/fairway';
import { fairwayScope } from '@/lib/redesign/flag';

/**
 * Route Suspense fallback for /golf/dashboard/settings/coaching-intelligence.
 *
 * Shape-matches FairwaySettingsCoachingIntelligence's CoachingIntelligenceFrame
 * (back-to-Settings link + ViewHeader masthead) plus its OWN `loading ||
 * !philosophy` branch — four stacked Surface cards (title + description +
 * two control rows), reproduced here with the shimmer `Skeleton` primitive
 * instead of that branch's un-shimmered raw divs.
 */
export default function CoachingIntelligenceLoading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto w-full max-w-[1200px] px-4 py-6 pb-24 md:px-6 md:py-8"
      >
        <span className="sr-only">Loading coaching intelligence settings…</span>

        {/* Back-to-Settings link */}
        <Skeleton className="mb-4 h-8 w-24" />

        {/* ViewHeader */}
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-9 w-64 max-w-full" />
          <Skeleton className="h-4 w-full max-w-lg" />
        </div>

        <div className="mt-8 flex flex-col gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col gap-4 rounded-card border border-border-subtle bg-surface p-8"
            >
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-5 w-44" />
                <Skeleton className="h-3.5 w-64 max-w-full" />
              </div>
              <div className="flex flex-col gap-3">
                <Skeleton className="h-8 w-full rounded-fw-sm" />
                <Skeleton className="h-8 w-3/4 rounded-fw-sm" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
