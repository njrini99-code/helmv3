import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';
import { Surface } from '@/components/fairway/surfaces/surface';

/**
 * P206 — the Suspense fallback for the Rounds library matches the LIVE
 * Fairway layout (FairwayRoundsLibrary.tsx, facelift composition per
 * docs/design/fairway-facelift/screens/rounds-library.md), populated-state
 * shape, since this fallback already commits to modeling ledgers-with-rows
 * rather than the empty state:
 *
 * - Masthead: ViewHeader's 3-row title column — eyebrow ("Team Rounds"/
 *   "Your Rounds"), title ("The library."/"Your rounds."), and a `meta`
 *   count+range line.
 * - Stage block: a readout line (two large values) over one chart-height
 *   rectangle. The route cannot know the role: the player page opens with
 *   the scoring stage (two Readouts, a verdict, a Ribbon —
 *   player-rounds.v2.md) and the coach page with the Cockpit cluster (a
 *   dial beside two Readouts — rounds-library.v2.md). Both are "big numbers
 *   over a plotted instrument," so one block reserves roughly the same
 *   height for either, with no fabricated dial or line.
 * - Toolbar row: a search-input-shaped block, then a row of filter-pill
 *   shapes on the left and one grouping-toggle shape on the right — the
 *   Toolbar itself is a `'use client'` component with framer-motion/scroll
 *   hooks, so this stays a plain dimension-matched placeholder rather than
 *   mounting the real interactive control tree during a loading state.
 * - ONE ledger Surface — never one Surface per group, matching the
 *   facelift's single matte surface with sticky seam headers. Two seam-
 *   header shapes + 8 total row shapes (5 + 3, "STATES: strip skeleton + 8
 *   row skeletons inside the surface" per the screen spec), separated by
 *   hairlines the same way the real ledger divides its rows.
 */
export default function Loading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-4 py-6 md:px-6"
      >
        <span className="sr-only">Loading rounds…</span>

        {/* Title block — ViewHeader's eyebrow + title + meta */}
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>

        {/* Stage block — eyebrow, two large readouts, a verdict line, then
            the plotted instrument's rectangle (Ribbon / cluster height). */}
        <div className="flex flex-col gap-4">
          <Skeleton className="h-3 w-16" />
          <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-9 w-16" />
              <Skeleton className="h-3 w-12" />
            </div>
          </div>
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-[200px] w-full rounded-fw-md" />
        </div>

        {/* Toolbar — search input + filter pills + Month/Week toggle */}
        <div className="flex flex-col gap-3">
          <Skeleton className="h-9 w-full sm:max-w-xs" />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-7 w-16 rounded-full" />
              ))}
            </div>
            <Skeleton className="h-8 w-28 rounded-fw-sm" />
          </div>
        </div>

        {/* ONE ledger Surface — a few seam headers + hairline rows, matching
            the facelift's single matte surface for the WHOLE list (never one
            Surface per date group). `overflow-clip` matches the live ledger
            Surface's own class, even though nothing here is sticky. */}
        <Surface padding="none" className="overflow-clip">
          {[5, 3].map((rows, gi) => (
            <div key={gi}>
              <div className="flex items-end justify-between gap-4 border-b border-border-subtle px-4 py-3">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-8 w-24" />
              </div>
              <div className="divide-y divide-border-subtle">
                {Array.from({ length: rows }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-4 py-3.5">
                    <Skeleton className="h-9 w-12" />
                    <div className="flex flex-1 flex-col gap-2">
                      <Skeleton className="h-4 w-2/5" />
                      <Skeleton className="h-3 w-1/4" />
                    </div>
                    <Skeleton className="h-7 w-12" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </Surface>
      </div>
    </div>
  );
}
