import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback';
import { Surface } from '@/components/fairway/surfaces/surface';

/**
 * P106 — Fairway-native loading state for the Game Fingerprint surface.
 * ----------------------------------------------------------------------------
 * The live page (FairwayPlayerGameFingerprint) is a max-w-[1100px] column with a
 * ViewHeader masthead, then an InstrumentCluster composite-rating hero (focal),
 * then 2-up dimension sections. This reserves the real slots with Fairway
 * tokens to remove the shape/token swap on hydrate (CLS / gate B3).
 */
function FairwayGameLoading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto w-full max-w-[1100px] px-4 py-6 md:px-6"
      >
        <span className="sr-only">Loading game fingerprint…</span>

        <div className="flex flex-col gap-10">
          {/* Masthead — eyebrow · title · description + actions */}
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Skeleton className="h-3 w-32" />
              <Skeleton className="mt-2 h-9 w-56 max-w-full" />
              <Skeleton className="mt-2 h-3.5 w-40" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-9 w-28 rounded-fw-md" />
            </div>
          </div>

          {/* Composite-rating hero (focal) + flanking rail */}
          <div className="flex flex-col gap-5 sm:gap-6">
            <div className="grid grid-cols-1 gap-5 sm:gap-6 lg:grid-cols-[2fr_minmax(15rem,1fr)]">
              <Surface elevation="shadow" padding="lg" className="min-w-0">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="mt-4 h-16 w-32" />
                <div className="mt-4 flex items-center gap-2">
                  <Skeleton className="h-6 w-24 rounded-full" />
                  <Skeleton className="h-3.5 w-28" />
                </div>
              </Surface>
              <Surface elevation="border" padding="md" className="min-w-0">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="mt-3 h-10 w-24" />
                <Skeleton className="mt-3 h-3.5 w-full" />
              </Surface>
            </div>
          </div>

          {/* 2-up dimension sections */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Surface key={i} elevation="border" padding="lg">
                <Skeleton className="h-4 w-32" />
                <div className="mt-4 space-y-3">
                  {Array.from({ length: 3 }).map((_, j) => (
                    <div key={j} className="flex items-center gap-3">
                      <Skeleton className="h-3.5 w-24 flex-shrink-0" />
                      <Skeleton className="h-2.5 flex-1 rounded-full" />
                      <Skeleton className="h-3.5 w-8 flex-shrink-0" />
                    </div>
                  ))}
                </div>
              </Surface>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Loading() {
  return <FairwayGameLoading />;
}
