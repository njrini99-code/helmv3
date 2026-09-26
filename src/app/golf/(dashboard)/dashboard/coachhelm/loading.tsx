import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback';

/* ============================================================================
 * Route Suspense fallback for the Player CoachHelm home
 * (/golf/dashboard/coachhelm).
 * ----------------------------------------------------------------------------
 * Shape-matches the settled first paint (2026-09-25):
 *
 *  - Outer shell: `PlayerCoachHelmHome`'s `flex flex-col gap-5` holding the
 *    `PlayerCoachHelmNav` strip (border-b, six min-h-11 tabs) and the
 *    Spine/Stage grid (`280px` rail until 1180px, then `300px`).
 *  - Spine: desktop only. On phones the home view is the root map
 *    (`RootToday`), and `PlayerCoachHelmHome` hides the compact mobile spine
 *    there, so this fallback draws no dark band above it. The desktop rail
 *    keeps `Spine.tsx`'s shape (hero, verdict, track, priorities, ledger, CTA).
 *  - Stage: `RootToday`'s top: eyebrow + title, then `RootSummary`'s one card
 *    (eyebrow, display number, headline, the 48px split bar, two 44px spot
 *    rows, the full-width primary), then the closed disclosure rows below.
 * ========================================================================== */

const HAIRLINE_COLOR = 'oklch(1 0 0 / 0.14)';
const SPINE_BAR = 'bg-text-on-accent/12';

export default function CoachHelmLoading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient font-fw-sans')}>
      <div className="mx-auto w-full max-w-[1440px] px-4 py-5 md:px-6 md:py-6">
        <div role="status" aria-busy="true" aria-live="polite" className="flex min-w-0 flex-col gap-5">
          <span className="sr-only">Loading CoachHelm…</span>

          {/* Nav — PlayerCoachHelmNav's own <nav>, rendered unconditionally
              above the Spine/Stage grid (PlayerCoachHelmHome.tsx:412-414):
              border-b border-border-subtle strip, 6 min-h-11 tab slots. */}
          <div aria-hidden="true" className="flex min-w-0 items-center gap-1 overflow-clip border-b border-border-subtle pb-px">
            {['w-16', 'w-24', 'w-24', 'w-20', 'w-16', 'w-20'].map((w, i) => (
              <div key={i} className="flex min-h-11 shrink-0 items-center px-3.5 py-2">
                <Skeleton className={`h-3 ${w}`} />
              </div>
            ))}
          </div>

          <div className="flex min-w-0 flex-col gap-5 min-[940px]:grid min-[940px]:grid-cols-[280px_minmax(0,1fr)] min-[940px]:items-start min-[1180px]:grid-cols-[300px_minmax(0,1fr)]">
            {/* Spine, desktop — Spine.tsx's vertical rail, hidden <940px. */}
            <div
              aria-hidden="true"
              className="hidden flex-col rounded-fw-lg border border-accent-700 bg-gradient-to-b from-accent-900 via-accent-800 to-accent-800 p-6 shadow-raise min-[940px]:flex min-[940px]:sticky min-[940px]:top-20"
            >
              <Skeleton className={`h-2.5 w-28 ${SPINE_BAR}`} />
              <Skeleton className={`mt-2.5 h-9 w-24 ${SPINE_BAR}`} />
              <Skeleton className={`mt-2.5 h-3.5 w-full ${SPINE_BAR}`} />

              <hr className="my-5 border-t" style={{ borderTopColor: HAIRLINE_COLOR }} />
              <Skeleton className={`h-[7px] w-full rounded-full ${SPINE_BAR}`} />
              <div className="mt-[7px] flex items-center justify-between">
                <Skeleton className={`h-3 w-8 ${SPINE_BAR}`} />
                <Skeleton className={`h-3 w-8 ${SPINE_BAR}`} />
              </div>

              <hr className="my-5 border-t" style={{ borderTopColor: HAIRLINE_COLOR }} />
              <Skeleton className={`h-2.5 w-16 ${SPINE_BAR}`} />
              <div className="mt-2.5 flex flex-col gap-2.5">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="grid grid-cols-[22px_1fr_auto] items-center gap-2.5">
                    <Skeleton className={`h-3 w-4 ${SPINE_BAR}`} />
                    <Skeleton className={`h-3.5 ${SPINE_BAR}`} />
                    <Skeleton className={`h-3 w-8 ${SPINE_BAR}`} />
                  </div>
                ))}
              </div>

              <hr className="my-5 border-t" style={{ borderTopColor: HAIRLINE_COLOR }} />
              <div className="flex flex-col gap-1.5">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between gap-3">
                    <Skeleton className={`h-3 w-16 ${SPINE_BAR}`} />
                    <Skeleton className={`h-3 w-10 ${SPINE_BAR}`} />
                  </div>
                ))}
              </div>

              <Skeleton className={`mt-5 h-10 w-full rounded-full ${SPINE_BAR}`} />
            </div>

            {/* Stage — RootToday: header, the RootSummary card, closed disclosures. */}
            <div aria-hidden="true" className="flex min-w-0 flex-col gap-6">
              <div className="flex flex-col gap-2">
                <Skeleton className="h-2.5 w-40" />
                <Skeleton className="h-8 w-64 max-w-full" />
              </div>
              <div className="flex flex-col gap-5 rounded-fw-lg border border-border-subtle bg-surface p-5 md:p-6">
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-2.5 w-48" />
                  <Skeleton className="h-10 w-24" />
                  <Skeleton className="h-4 w-full" />
                </div>
                <Skeleton className="h-12 w-full rounded-fw-md" />
                <div className="flex flex-col gap-1">
                  <Skeleton className="h-2.5 w-24" />
                  {[0, 1].map((i) => (
                    <div key={i} className="flex min-h-11 items-center gap-3 py-2">
                      <Skeleton circle className="h-7 w-7 shrink-0" />
                      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <Skeleton className="h-3.5 w-40 max-w-full" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                      <Skeleton className="h-5 w-10 shrink-0" />
                    </div>
                  ))}
                </div>
                <Skeleton className="h-12 w-full rounded-full" />
              </div>
              <div className="flex flex-col">
                {['w-32', 'w-40', 'w-28'].map((w, i) => (
                  <div key={i} className="flex min-h-11 items-center justify-between border-b border-border-subtle py-2">
                    <Skeleton className={`h-4 ${w}`} />
                    <Skeleton className="h-4 w-4" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
