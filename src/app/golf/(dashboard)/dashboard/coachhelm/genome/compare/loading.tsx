import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback';
import { Surface } from '@/components/fairway/surfaces/surface';

/**
 * Route-level loading fallback for the coach genome-compare page
 * (GenomeCompareView, mounted inside CoachHelmShell active="players").
 *
 * Mirrors CoachHelmShell's real chrome — masthead + leaf breadcrumb
 * ("Players > Compare") + the persistent sub-nav strip (collapsed to the
 * single "Brief" tab per the Spine & Stage redesign) — then
 * GenomeCompareView's own InstrumentCluster cockpit: a focal diverging-bar
 * fingerprint panel (2fr) + a flanking readout rail (1fr), followed by the
 * 2-up player-picker row.
 */
export default function Loading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient')}>
      <div role="status" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading genome comparison…</span>

        {/* Masthead — eyebrow / title / description (ViewHeader). */}
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 px-4 pt-2 md:px-6">
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-9 w-72 max-w-full" />
            <Skeleton className="h-4 w-56 max-w-full" />
          </div>

          {/* Leaf breadcrumb — "Players > Compare". */}
          <div className="-mt-3 flex items-center gap-1.5">
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-3 w-3 rounded-full" />
            <Skeleton className="h-3 w-16" />
          </div>

          {/* Persistent sub-nav strip — collapsed to the single "Brief" tab. */}
          <div className="flex w-full items-center gap-1 border-b border-border-subtle pb-3">
            <Skeleton className="h-5 w-12" />
          </div>
        </div>

        {/* Body — the InstrumentCluster cockpit + picker row. */}
        <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6">
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-1 gap-5 sm:gap-6 lg:grid-cols-[2fr_minmax(15rem,1fr)]">
              {/* Primary — the diverging-bar fingerprint hero. */}
              <Surface elevation="shadow" padding="lg" className="min-w-0">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-32" />
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
                <Skeleton className="mt-3 h-3.5 w-64 max-w-full" />
                <div className="mt-6 space-y-3">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="h-3.5 w-24 flex-shrink-0" />
                      <Skeleton className="h-3 flex-1 rounded-full" />
                      <Skeleton className="h-3.5 w-8 flex-shrink-0" />
                    </div>
                  ))}
                </div>
              </Surface>

              {/* Secondary — the compare readout rail. */}
              <div className="flex min-w-0 flex-col gap-5 sm:gap-6">
                <Surface elevation="border" padding="md" className="min-w-0">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="mt-3 h-8 w-16" />
                  <Skeleton className="mt-4 h-3 w-24" />
                  <Skeleton className="mt-3 h-8 w-16" />
                </Surface>
                <Surface elevation="border" padding="md" className="min-w-0">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="mt-3 h-3.5 w-full" />
                </Surface>
              </div>
            </div>

            {/* Pickers — two player-selector panels. */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Surface key={i} elevation="border" padding="md">
                  <Skeleton className="h-3 w-20" />
                  <div className="mt-3 flex flex-col gap-2">
                    {Array.from({ length: 4 }).map((__, j) => (
                      <Skeleton key={j} className="h-10 w-full rounded-fw-md" />
                    ))}
                  </div>
                </Surface>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
