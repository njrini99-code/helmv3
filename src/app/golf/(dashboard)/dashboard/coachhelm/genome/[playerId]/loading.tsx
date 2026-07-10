import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback';
import { Surface } from '@/components/fairway/surfaces/surface';

/**
 * P106 — Fairway-native loading state for the Genome detail surface.
 * ----------------------------------------------------------------------------
 * The live page (GenomeDetailView) is a max-w-[1200px] CoachHelmShell (eyebrow →
 * title → breadcrumb → sub-nav) wrapping an asymmetric InstrumentCluster cockpit
 * (radar hero focal + persona rail + 3-up tertiary readout row) and a 4-up
 * Dimensions grid. This reserves the cockpit's real slots with Fairway tokens to
 * remove the shape/token swap on hydrate (CLS / gate B3).
 */
function FairwayGenomeLoading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto flex w-full max-w-[1200px] flex-col px-4 pt-2 md:px-6"
      >
        <span className="sr-only">Loading genome…</span>

        {/* Masthead — eyebrow · title · description + actions */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-2 h-9 w-56 max-w-full" />
            <Skeleton className="mt-2 h-3.5 w-64 max-w-full" />
          </div>
          <Skeleton className="h-9 w-28 rounded-fw-md" />
        </div>

        {/* Sub-nav strip */}
        <div className="mt-5 flex items-center gap-2 border-b border-border-subtle pb-3">
          {[80, 104, 96, 84].map((w) => (
            <Skeleton key={w} className="h-7 rounded-full" style={{ width: w }} />
          ))}
        </div>

        {/* Body — radar-hero cockpit + dimensions grid */}
        <div className="flex flex-col gap-6 py-6">
          {/* Cockpit: focal radar hero (2fr) + persona rail (1fr) */}
          <div className="flex flex-col gap-5 sm:gap-6">
            <div className="grid grid-cols-1 gap-5 sm:gap-6 lg:grid-cols-[2fr_minmax(15rem,1fr)]">
              <Surface elevation="shadow" padding="lg" className="min-w-0">
                <Skeleton className="h-3 w-28" />
                <Skeleton circle className="mx-auto mt-5 h-56 w-56 max-w-full" />
              </Surface>
              <div className="flex min-w-0 flex-col gap-5 sm:gap-6">
                <Surface elevation="border" padding="md" className="min-w-0">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="mt-3 h-6 w-32" />
                  <Skeleton className="mt-3 h-3.5 w-full" />
                  <Skeleton className="mt-2 h-3.5 w-3/4" />
                </Surface>
              </div>
            </div>
            {/* Tertiary — 3-up readout row */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Surface key={i} elevation="border" padding="md">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="mt-3 h-8 w-20" />
                </Surface>
              ))}
            </div>
          </div>

          {/* Dimensions panel — 4-up cell grid */}
          <Surface elevation="border" padding="lg">
            <Skeleton className="h-4 w-28" />
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="rounded-fw-md bg-surface-sunken p-4">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="mt-2.5 h-6 w-12" />
                </div>
              ))}
            </div>
          </Surface>
        </div>
      </div>
    </div>
  );
}

export default function Loading() {
  return <FairwayGenomeLoading />;
}
