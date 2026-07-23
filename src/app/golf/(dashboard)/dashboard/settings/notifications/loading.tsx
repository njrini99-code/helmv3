import { Skeleton } from '@/components/fairway';
import { fairwayScope } from '@/lib/redesign/flag';

/**
 * Route Suspense fallback for /golf/dashboard/settings/notifications.
 *
 * Shape-matches FairwaySettingsNotifications: a `max-w-[760px]` ViewHeader
 * masthead, the Quiet mode toggle row, and the per-category channel matrix
 * (a caption strip, the Update/Push/Email/In-app column header, and three
 * category groups of rows) in the same order the live page renders them.
 */
export default function NotificationSettingsLoading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto w-full max-w-[760px] px-4 py-6 pb-24 md:px-6 md:py-8"
      >
        <span className="sr-only">Loading notification preferences…</span>

        {/* ViewHeader */}
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-9 w-52 max-w-full" />
          <Skeleton className="h-4 w-full max-w-lg" />
          <Skeleton className="h-4 w-2/3 max-w-lg" />
        </div>

        {/* Quiet mode row */}
        <div className="mt-8 flex items-center justify-between gap-4 rounded-card border border-border-subtle bg-surface p-6">
          <div className="min-w-0">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-1.5 h-3.5 w-64 max-w-full" />
          </div>
          <Skeleton className="h-6 w-11 flex-shrink-0 rounded-full" />
        </div>

        {/* Per-category matrix */}
        <div className="mt-10">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-3.5 w-64 max-w-full" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-8 w-24 rounded-full" />
              <Skeleton className="h-8 w-24 rounded-full" />
              <Skeleton className="h-8 w-28 rounded-full" />
            </div>
          </div>

          <div className="overflow-hidden rounded-card border border-border-subtle bg-surface">
            <div className="border-b border-border-subtle bg-surface-sunken/40 px-5 py-3">
              <Skeleton className="h-3 w-72 max-w-full" />
            </div>

            <div className="grid grid-cols-12 items-center gap-2 border-b border-border-subtle px-5 py-3">
              <Skeleton className="col-span-6 h-2.5 w-14" />
              <Skeleton className="col-span-2 h-2.5 w-10 justify-self-center" />
              <Skeleton className="col-span-2 h-2.5 w-10 justify-self-center" />
              <Skeleton className="col-span-2 h-2.5 w-12 justify-self-center" />
            </div>

            {[3, 4, 3].map((rowCount, g) => (
              <div key={g} className={g > 0 ? 'border-t border-border-subtle' : undefined}>
                <div className="px-5 pt-3">
                  <Skeleton className="h-3 w-32" />
                </div>
                {Array.from({ length: rowCount }).map((_, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-12 items-center gap-2 px-5 py-3"
                  >
                    <Skeleton
                      className="col-span-6 h-3.5"
                      style={{ width: `${70 - (i % 3) * 12}%` }}
                    />
                    <Skeleton className="col-span-2 h-5 w-9 justify-self-center rounded-full" />
                    <Skeleton className="col-span-2 h-5 w-9 justify-self-center rounded-full" />
                    <Skeleton className="col-span-2 h-5 w-9 justify-self-center rounded-full" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
