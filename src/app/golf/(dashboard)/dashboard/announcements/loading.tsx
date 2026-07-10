import { Skeleton, SkeletonText } from '@/components/fairway/feedback/Skeleton';
import { fairwayScope } from '@/lib/redesign/flag';

/**
 * Announcements route loading state.
 *
 * Uses the token-correct Fairway Skeleton primitives (bg-surface-sunken /
 * rounded-card / border-border-subtle) so the loading screen matches the
 * FairwayAnnouncements page it precedes — same centered max-w-[760px]
 * column, same ViewHeader rhythm, same card feed shape.
 */
export default function Loading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas font-fw-sans')}>
      <div className="mx-auto w-full max-w-[760px] px-4 py-6 md:px-6 md:py-8 pb-24">
        {/* ViewHeader skeleton — eyebrow · title · description · primary action */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-3">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-11 w-40 rounded-fw-md" />
        </div>

        {/* Card feed skeleton — mirrors the flex flex-col gap-3 feed */}
        <div className="mt-8 flex flex-col gap-3" role="status" aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading announcements…</span>
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-card border border-border-subtle bg-surface p-5"
            >
              <div className="flex items-start gap-3">
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-4 w-12 rounded-full" />
              </div>
              <div className="mt-3">
                <SkeletonText lines={2} lastLineWidth="70%" />
              </div>
              <div className="mt-4 flex items-center gap-3">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
