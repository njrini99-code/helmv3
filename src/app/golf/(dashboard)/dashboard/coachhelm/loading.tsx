import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback';
import { FROSTED_CARD_CLASS } from '@/components/fairway/modules/frosted';
import { cn } from '@/lib/utils';

/* ============================================================================
 * Route Suspense fallback for the Player CoachHelm overview
 * (/golf/dashboard/coachhelm) — audit HUB-20.
 * ----------------------------------------------------------------------------
 * Shape-matches the overview's first paint (2026-09-24 rebuild), at every
 * width, because there is no spine any more:
 *
 *   page.tsx       fairwayScope → mx-auto max-w-[1440px] px-4 py-5 md:px-6 md:py-6
 *   PlayerCoachHelmHome  mx-auto max-w-[1120px] flex-col gap-6:
 *                  sr-only h1 · PlayerCoachHelmNav (border-b strip, six
 *                  min-h-11 tabs) · the stage
 *   PlayerHubFeed  mx-auto max-w-[920px] flex-col gap-8:
 *                  masthead (eyebrow, two-line headline, trend sentence,
 *                  frosted next-round window + last-round box, full-width
 *                  "Log a round" on mobile) → "01 What's changing"
 *                  (three window rows) → "02 Why" (the frosted lead insight:
 *                  eyebrow row, claim, cause chain, evidence rail, actions).
 *
 * `loading.tsx` cannot read `?view=`, so it always draws the overview, the
 * view a player lands on.
 * ========================================================================== */

const SECTION = 'border-t border-border-subtle pt-6';

export default function CoachHelmLoading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas font-fw-sans')}>
      <div className="mx-auto w-full max-w-[1440px] px-4 py-5 md:px-6 md:py-6">
        <div
          role="status"
          aria-busy="true"
          aria-live="polite"
          className="mx-auto flex w-full min-w-0 max-w-[1120px] flex-col gap-6"
        >
          <span className="sr-only">Loading CoachHelm…</span>

          {/* Nav: six min-h-11 tabs over a hairline. */}
          <div aria-hidden="true" className="flex min-w-0 items-center gap-1 overflow-clip border-b border-border-subtle pb-px">
            {['w-16', 'w-24', 'w-24', 'w-20', 'w-16', 'w-20'].map((w, i) => (
              <div key={i} className="flex min-h-11 shrink-0 items-center px-3.5 py-2">
                <Skeleton className={`h-3 ${w}`} />
              </div>
            ))}
          </div>

          <div aria-hidden="true" className="mx-auto flex w-full max-w-[920px] flex-col gap-8">
            {/* Masthead */}
            <div className="flex flex-col gap-5">
              <div>
                <Skeleton className="h-3.5 w-44" />
                <Skeleton className="mt-3 h-7 w-full max-w-[520px] sm:h-9" />
                <Skeleton className="mt-2 h-7 w-3/5 sm:hidden" />
                <Skeleton className="mt-3 h-4 w-full max-w-[600px]" />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                <div className={cn(FROSTED_CARD_CLASS, 'p-5')}>
                  <Skeleton className="h-3.5 w-20" />
                  <Skeleton className="mt-2 h-9 w-28" />
                  <Skeleton className="mt-4 h-3 w-full rounded-full" />
                  <Skeleton className="mt-2 h-3.5 w-32" />
                  <Skeleton className="mt-1.5 h-3.5 w-48" />
                </div>
                <div className="flex flex-col justify-center rounded-fw-lg border border-border-subtle px-5 py-4">
                  <Skeleton className="h-3.5 w-20" />
                  <Skeleton className="mt-2 h-8 w-20" />
                  <Skeleton className="mt-2 h-3.5 w-36" />
                </div>
              </div>
              <Skeleton className="h-11 w-full rounded-fw-md sm:w-32" />
            </div>

            {/* 01 What's changing */}
            <div className={SECTION}>
              <Skeleton className="mb-4 h-6 w-48" />
              <Skeleton className="mb-3 h-3.5 w-24" />
              <div className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-3 min-[520px]:flex-col min-[520px]:items-start min-[520px]:gap-1.5">
                    <Skeleton className="h-8 w-16 shrink-0" />
                    <div className="flex flex-col gap-1.5">
                      <Skeleton className="h-3.5 w-24" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 02 Why: the frosted lead insight */}
            <div className={SECTION}>
              <Skeleton className="mb-4 h-6 w-24" />
              <div className={cn(FROSTED_CARD_CLASS, 'p-5 sm:p-6')}>
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="mt-3 h-7 w-full" />
                <Skeleton className="mt-2 h-7 w-2/3" />
                <div className="mt-4 flex flex-col gap-3 border-l-2 border-border-subtle pl-4">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="flex flex-col gap-1.5">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-4 w-full max-w-[420px]" />
                    </div>
                  ))}
                </div>
                <Skeleton className="mt-5 h-2 w-full rounded-full" />
                <Skeleton className="mt-3 h-3.5 w-56" />
                <div className="mt-4 flex gap-2">
                  <Skeleton className="h-9 w-36 rounded-fw-md" />
                  <Skeleton className="h-9 w-20 rounded-fw-md" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
