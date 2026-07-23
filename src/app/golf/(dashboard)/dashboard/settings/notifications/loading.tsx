import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';
import { Surface } from '@/components/fairway/surfaces/surface';

/**
 * Suspense fallback for /golf/dashboard/settings/notifications. Mirrors
 * FairwaySettingsNotifications' real max-w-[760px] shell: a ViewHeader
 * masthead, the quiet-mode Surface card, then a grid-cols-12 per-category
 * channel matrix grouped into 3 sections — never the legacy FormPageSkeleton.
 */
export default function Loading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto w-full max-w-[760px] px-4 py-6 md:px-6 md:py-8 pb-24"
      >
        <span className="sr-only">Loading notification preferences…</span>

        {/* Masthead (ViewHeader shape) */}
        <div className="flex flex-col gap-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-4 w-full max-w-[68ch]" />
        </div>

        {/* Quiet mode card */}
        <Surface elevation="border" padding="md" className="mt-8 flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-64" />
          </div>
          <Skeleton className="h-6 w-11 rounded-full" />
        </Surface>

        {/* Per-category channel matrix */}
        <div className="mt-10">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-3 w-64" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-8 w-24 rounded-fw-md" />
              <Skeleton className="h-8 w-24 rounded-fw-md" />
              <Skeleton className="h-8 w-28 rounded-fw-md" />
            </div>
          </div>

          <Surface elevation="border" padding="none">
            {/* Column header */}
            <div className="grid grid-cols-12 items-center gap-2 border-b border-border-subtle px-4 py-3 sm:px-5">
              <div className="col-span-6">
                <Skeleton className="h-3 w-16" />
              </div>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="col-span-2 flex justify-center">
                  <Skeleton className="h-3 w-10" />
                </div>
              ))}
            </div>

            {/* Groups + rows */}
            {[
              { rows: 2 },
              { rows: 4 },
              { rows: 3 },
            ].map((group, gi) => (
              <div key={gi}>
                <div className="border-b border-border-subtle px-4 py-2 sm:px-5">
                  <Skeleton className="h-3 w-32" />
                </div>
                <div className="divide-y divide-border-subtle">
                  {Array.from({ length: group.rows }).map((_, ri) => (
                    <div key={ri} className="grid grid-cols-12 items-center gap-2 px-4 py-3.5 sm:px-5">
                      <div className="col-span-6 min-w-0">
                        <Skeleton className="h-3.5 w-40 max-w-full" />
                      </div>
                      {Array.from({ length: 3 }).map((__, ci) => (
                        <div key={ci} className="col-span-2 flex justify-center">
                          <Skeleton className="h-6 w-11 rounded-full" />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </Surface>
        </div>
      </div>
    </div>
  );
}
