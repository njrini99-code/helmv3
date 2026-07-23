import { Skeleton, Surface } from '@/components/fairway';
import { fairwayScope } from '@/lib/redesign/flag';

/**
 * Route Suspense fallback for /golf/dashboard/rounds/new.
 *
 * Shape-matches FairwayNewRoundEntry's Setup step: a max-w-2xl column with the
 * dark warm-black "cockpit" header band (eyebrow/title/description + the
 * green 4-step progress spine), the full-width "Browse course library" CTA,
 * and the two floating white Surface cards that always render on first paint
 * — Course and Round details. Replaces the legacy `FormPageSkeleton` (a
 * cream, single-card, generic labeled-input form), which bore no resemblance
 * to the real cockpit-band + step-spine + course-carousel shell it swapped
 * into.
 */
export default function Loading() {
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
          {/* Cockpit band — dark on-dark band + 4-step spine */}
          <div className="on-dark relative overflow-hidden rounded-card bg-nav-bg p-7 shadow-soft md:p-8">
            <Skeleton className="h-3 w-32 bg-cream-50/15" />
            <Skeleton className="mt-3 h-7 w-64 max-w-full bg-cream-50/20" />
            <Skeleton className="mt-2 h-4 w-72 max-w-full bg-cream-50/10" />
            <div className="mt-7 flex items-stretch gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex flex-1 flex-col gap-2">
                  <span className="h-1 w-full overflow-hidden rounded-full bg-cream-50/10" />
                  <Skeleton className="h-3 w-10 bg-cream-50/10" />
                </div>
              ))}
            </div>
          </div>

          {/* Browse course library CTA */}
          <Skeleton className="h-11 w-full rounded-fw-md" />

          {/* Course card */}
          <Surface elevation="shadow" padding="lg" className="flex flex-col gap-4" aria-hidden="true">
            <div className="flex items-center gap-2">
              <span className="h-5 w-[3px] flex-shrink-0 rounded-full bg-accent-500" />
              <Skeleton className="h-4 w-20" />
            </div>
            <div className="flex flex-col gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-fw-md" />
              ))}
            </div>
          </Surface>

          {/* Round details card */}
          <Surface elevation="shadow" padding="lg" aria-hidden="true">
            <div className="mb-4 flex items-center gap-2">
              <span className="h-5 w-[3px] flex-shrink-0 rounded-full bg-accent-500" />
              <Skeleton className="h-4 w-28" />
            </div>
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <Skeleton className="h-10 w-full rounded-fw-md" />
                <Skeleton className="h-10 w-full rounded-fw-md" />
              </div>
              <Skeleton className="h-10 w-full rounded-fw-md" />
            </div>
          </Surface>
        </div>
      </div>
    </div>
  );
}
