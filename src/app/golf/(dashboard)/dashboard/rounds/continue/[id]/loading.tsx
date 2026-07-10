import { Skeleton } from '@/components/fairway';
import { fairwayScope } from '@/lib/redesign/flag';

/**
 * Route Suspense fallback for /golf/dashboard/rounds/continue/[id].
 *
 * Matches the real header ContinueRoundClient renders above the tracker (the
 * "Continuing Round" resume banner — `bg-surface` / `border-b
 * border-border-subtle`, `max-w-[720px]` centered), then reserves the shape of
 * FairwayShotTracking's own chrome below it: the sticky `bg-elevated`
 * scorecard header strip and FairwayHoleHero's card (header row + the single
 * flyover band).
 *
 * NOTE — ground-truthed against the live components, not a literal "dark
 * scorecard band": both FairwayScorecardHeader and FairwayHoleHero were
 * deliberately redesigned to a LIGHT cockpit (their own docstrings: "the dark
 * band fought the light body" / "was an on-dark band"). A dark placeholder
 * here would itself be the wrong-chrome flash this skeleton exists to avoid,
 * so the shapes below reuse the live LIGHT tokens instead.
 */
export default function Loading() {
  return (
    <>
      {/* Header banner — mirrors ContinueRoundClient's "Continuing Round" strip */}
      <div className={fairwayScope('bg-surface border-b border-border-subtle px-4 py-3')}>
        <div className="mx-auto flex max-w-[720px] items-center gap-3">
          <Skeleton className="h-8 w-8 shrink-0 rounded-fw-md" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48 max-w-full" />
          </div>
          <Skeleton className="h-3 w-16 shrink-0" />
        </div>
      </div>

      <div
        className={fairwayScope('min-h-full bg-canvas')}
        role="status"
        aria-busy="true"
        aria-live="polite"
      >
        <span className="sr-only">Loading round…</span>

        {/* Sticky scorecard header — bg-elevated hole-by-hole strip */}
        <div className="bg-elevated shadow-flat">
          <div className="flex items-center gap-2 overflow-x-auto border-b border-border-subtle px-3 py-2.5">
            {Array.from({ length: 9 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-9 shrink-0 rounded-fw-sm" />
            ))}
          </div>
        </div>

        {/* Hole hero card — header row + the one flyover band */}
        <div className="mx-auto max-w-[720px] px-4 py-4">
          <div className="overflow-hidden rounded-card border border-border-subtle bg-surface">
            <div className="flex items-start justify-between gap-4 px-5 pt-5">
              <div className="min-w-0 space-y-2">
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-4 w-40" />
              </div>
              <div className="shrink-0 space-y-1 text-right">
                <Skeleton className="ml-auto h-8 w-16" />
                <Skeleton className="ml-auto h-3 w-12" />
              </div>
            </div>
            <div className="px-3 pb-3 pt-4">
              <Skeleton className="aspect-[8/3] w-full rounded-fw-md" />
            </div>
          </div>

          {/* Shot entry area */}
          <div className="mt-4 space-y-3">
            <Skeleton className="h-11 w-full rounded-fw-md" />
            <Skeleton className="h-11 w-full rounded-fw-md" />
          </div>
        </div>
      </div>
    </>
  );
}
