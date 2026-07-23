import { Skeleton } from '@/components/fairway';
import { fairwayScope } from '@/lib/redesign/flag';

/**
 * Route Suspense fallback for /golf/dashboard/rounds/new.
 *
 * Shape-matches FairwayNewRoundEntry's `setup` step (the screen every player
 * lands on first): a `max-w-2xl` column with the dark "cockpit" header band
 * (`bg-nav-bg`, on-dark eyebrow/title/description + the green 4-step progress
 * spine — see CockpitBand/StepSpine in FairwayNewRoundEntry.tsx), the primary
 * "Browse course library" CTA, and the Course Surface card (source toggle +
 * search + a sunken list of saved-course rows).
 */
export default function NewRoundLoading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto w-full max-w-2xl px-4 py-6 md:py-10"
      >
        <span className="sr-only">Loading new round…</span>

        <div className="flex flex-col gap-6">
          {/* Cockpit band — on-dark, matches bg-nav-bg exactly so the real
              band doesn't "pop in" a different color once it hydrates. */}
          <div className="on-dark relative overflow-hidden rounded-card bg-nav-bg p-7 shadow-soft md:p-8">
            <Skeleton className="h-3 w-32 bg-nav-text-dim/20" />
            <Skeleton className="mt-3 h-7 w-64 max-w-full bg-nav-text-dim/20" />
            <Skeleton className="mt-2 h-3.5 w-72 max-w-full bg-nav-text-dim/20" />
            <div className="mt-7 flex items-stretch gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-1 w-full rounded-full bg-nav-text-dim/20" />
                  <Skeleton className="h-2.5 w-3/4 bg-nav-text-dim/20" />
                </div>
              ))}
            </div>
          </div>

          {/* Primary CTA — Browse course library */}
          <Skeleton className="h-11 w-full rounded-full" />

          {/* Course card */}
          <div className="flex flex-col gap-4 rounded-card border border-border-subtle bg-surface p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-8 w-28 rounded-full" />
            </div>
            <Skeleton className="h-11 w-full rounded-fw-md" />
            <div className="flex flex-col gap-2 rounded-fw-md bg-surface-sunken p-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-fw-md border border-border-subtle bg-surface p-3.5"
                >
                  <Skeleton className="h-9 w-9 flex-shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1">
                    <Skeleton className="h-3.5" style={{ width: `${70 - i * 10}%` }} />
                    <Skeleton className="mt-1.5 h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
