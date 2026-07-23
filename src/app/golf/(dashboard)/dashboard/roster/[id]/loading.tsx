import { Skeleton, Surface } from '@/components/fairway';
import { fairwayScope } from '@/lib/redesign/flag';

/**
 * Route Suspense fallback for /golf/dashboard/roster/[id].
 *
 * Shape-matches the redesigned FairwayPlayerProfile: a max-w-[1200px] single
 * column with a quiet "Roster" back-link, an identity-header Surface
 * (avatar + name/year/status/location), the 3-up cross-surface nav grid
 * (Scouting Report / Game Fingerprint / Genome), and the shared
 * <StatsSpineStage> spine+stage layout below — matching that component's OWN
 * loading branch (`min-[940px]:grid-cols-[300px_1fr]` with two h-[480px]
 * blocks) so there's no second jump once it takes over. Replaces the legacy
 * `DetailPageSkeleton` (max-w-5xl, 2-col main+sidebar, warm-* / surface-matte
 * chrome), which reshaped the page (CLS) when the Fairway profile mounted.
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
        <span className="sr-only">Loading player profile…</span>

        {/* Back to roster */}
        <Skeleton className="mb-5 h-8 w-20" />

        {/* Identity header */}
        <Surface elevation="shadow" padding="lg" className="mb-8" aria-hidden="true">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <Skeleton className="h-20 w-20 flex-shrink-0 rounded-2xl sm:h-24 sm:w-24" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <Skeleton className="h-9 w-48 max-w-full" />
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Skeleton className="h-5 w-14 rounded-full" />
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </div>
                  <Skeleton className="mt-2 h-4 w-32" />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Skeleton className="h-8 w-20 rounded-fw-md" />
                  <Skeleton className="h-8 w-24 rounded-fw-md" />
                </div>
              </div>
              <Skeleton className="mt-3 h-3 w-40" />
            </div>
          </div>
        </Surface>

        {/* Cross-surface links — 3-up nav grid */}
        <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-2xl border border-border-subtle bg-surface px-4 py-3"
            >
              <Skeleton className="h-10 w-10 flex-shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="mt-1.5 h-3 w-32" />
              </div>
            </div>
          ))}
        </div>

        {/* StatsSpineStage — mirrors its own loading branch exactly */}
        <div className="flex flex-col gap-6 min-[940px]:grid min-[940px]:grid-cols-[300px_1fr]" aria-hidden="true">
          <Skeleton className="h-[480px] rounded-fw-lg" />
          <Skeleton className="h-[480px] rounded-fw-lg" />
        </div>
      </div>
    </div>
  );
}
