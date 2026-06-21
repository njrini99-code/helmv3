import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback';

/**
 * Route-level loading fallback for the player My Game Profile (genome) view.
 *
 * Fairway-native (warm `--fw-*` skeleton blocks, not the legacy ui/skeleton set)
 * so the skeleton→page swap is seamless instead of flashing legacy chrome. Wrapped
 * in the same `fairwayScope('min-h-full bg-canvas')` frame + `max-w-[760px]` column
 * the page itself uses, and shape-matched to FairwayMyGameProfile: ViewHeader
 * (eyebrow / title / description) → the genome radar hero (a round radar block over
 * a persona column of chip rows) → a 2/4-up dimension readout grid. Mirrors the
 * my-standing/loading.tsx approach.
 */
export default function Loading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto w-full max-w-[760px] px-4 py-6 md:px-6"
      >
        <span className="sr-only">Loading your game profile…</span>

        <div className="flex flex-col gap-8">
          {/* Masthead — eyebrow / title / description (ViewHeader). */}
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-9 w-56" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>

          {/* Hero — the genome radar (round block) beside the persona column. */}
          <div className="rounded-card border border-border-subtle bg-surface p-6 md:p-8">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] md:items-center">
              {/* Radar polygon placeholder — a circular data-viz block. */}
              <div className="flex justify-center">
                <Skeleton circle className="h-[260px] w-[260px] max-w-full" />
              </div>

              {/* Persona — course-profile line + strengths/watchouts chip rows. */}
              <div className="flex flex-col gap-5">
                <div className="space-y-2.5">
                  <Skeleton className="h-3.5 w-full" />
                  <Skeleton className="h-3.5 w-4/5" />
                </div>
                {Array.from({ length: 2 }).map((_, group) => (
                  <div key={group} className="flex flex-col gap-2">
                    <Skeleton className="h-3 w-20" />
                    <div className="flex flex-wrap gap-2">
                      {Array.from({ length: 3 }).map((_, chip) => (
                        <Skeleton key={chip} className="h-7 w-24 rounded-full" />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Dimensions — the per-axis readout grid (2-up → 4-up). */}
          <section className="flex flex-col gap-3">
            <Skeleton className="h-3 w-28" />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-card border border-border-subtle bg-surface p-4"
                >
                  <Skeleton className="h-7 w-16" />
                  <Skeleton className="mt-3 h-3 w-20" />
                </div>
              ))}
            </div>
          </section>

          {/* Quiet footer note tying the genome back to the coach loop. */}
          <div className="rounded-card border border-border-subtle bg-surface p-4">
            <Skeleton className="h-3 w-3/4 max-w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
