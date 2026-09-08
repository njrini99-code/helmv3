import { Skeleton } from '@/components/fairway';
import { fairwayScope } from '@/lib/redesign/flag';

/**
 * Route Suspense fallback for /golf/dashboard/rounds/continue/[id].
 *
 * page.tsx is an async Server Component with no client-side loading branch of
 * its own — it awaits every query, then renders the fully-settled tree in one
 * pass (page.tsx:163-678). There is no intermediate "loading" state inside
 * ContinueRoundClient to shape-match instead: the settled layout below IS the
 * t=0 target this fallback has to reserve.
 *
 * Top to bottom, what actually mounts:
 *
 * 1. RoundTypeEditor, CLOSED state (page.tsx:651-660, unconditional,
 *    `className="mb-3"`, no wrapping padding). `open` seeds
 *    `useState(false)` (RoundTypeEditor.tsx:153), and closed renders exactly
 *    one `Button variant="secondary" size="sm"` reading "Change round type"
 *    (RoundTypeEditor.tsx:229-240) — nothing else. Buttons are pill-shaped
 *    (`rounded-full`, button.tsx:94) at `min-h-[36px]` (button.tsx:160,
 *    `size="sm"`). The shell renders with `contentPadding={false}`
 *    (FairwayDashboardShell.tsx:637-640: "Pages own their gutters") and
 *    AnimatedPage/AnimatedItem add no box of their own
 *    (AnimatedPage.tsx:68-69/82-86), so this pill sits flush to the screen
 *    edge with only its own `mb-3` below it — reserving a `px-4` gutter here
 *    would invent geometry the real page doesn't have.
 *
 * 2. ContinueRoundClient's "Continuing Round" resume banner
 *    (continue-round-client.tsx:1515-1535) — `bg-surface` /
 *    `border-b border-border-subtle`, `max-w-[720px]` centered.
 *
 * 3. FairwayShotTracking's own chrome (continue-round-client.tsx mounts it
 *    via FairwayShotTracking.tsx:576-591 with `onExit` always a function
 *    (continue-round-client.tsx:1613), never `undefined`):
 *      a. FairwayScorecardHeader's sticky bar (FairwayScorecardHeader.tsx:
 *         327-412). Below `lg` it opens with its OWN mobile control row
 *         (:332-370) — Prev + Exit on the left (Exit is gated on `onExit`
 *         truthiness at :345-348, which is always satisfied here), "Hole X /
 *         Y" on the right, Next on the far right — then the scrollable hole
 *         strip. Each hole cell is `min-w-[72px]` with FOUR stacked text
 *         rows — number, "Par N", yardage, score (:239-280) — not a small
 *         square pill, and the strip always ends in an Out/Total summary
 *         column, `min-w-[78px]` on a tinted fill (:382-389). `belowSlot`
 *         (:411) renders FairwayShotPills — a "Shot N" eyebrow label over a
 *         track of small dot marks with one dominant current-shot chip
 *         (FairwayShotPills.tsx:92-98, 116-131).
 *      b. FairwayHoleHero's card (FairwayHoleHero.tsx:213-253) — the header
 *         row (Hole N + Par chip + subtitle, right-aligned distance/score
 *         readout) then the ONE flyover band at a fixed `aspect-[8/3]`
 *         (:249-251).
 *      c. FairwayShotEntry's "Shot result" section (FairwayShotEntry.tsx:
 *         317-370) — the one section every hole state renders regardless of
 *         shot type, inside a shadow-elevation Surface
 *         (`rounded-card bg-surface shadow-soft`, :242): a label row over a
 *         grid of `min-h-[52px]` pills (2 columns, 3 from `sm`). The sticky
 *         action bar underneath it (:557-609) always carries a full-width
 *         primary "Next shot" action plus a secondary row ("+ Penalty").
 *
 * NOTE — ground-truthed against the live components, not a literal "dark
 * scorecard band": both FairwayScorecardHeader and FairwayHoleHero were
 * deliberately redesigned to a LIGHT cockpit (their own docstrings: "the dark
 * band fought the light body" / "was an on-dark band"). A dark placeholder
 * here would itself be the wrong-chrome flash this skeleton exists to avoid,
 * so the shapes below reuse the live LIGHT tokens instead.
 *
 * The content column's real max-width is `max-w-5xl` (FairwayShotTracking.tsx:
 * 597), not the `max-w-[720px]` used below for the hero/entry column — kept
 * narrower here because this is a mobile-first fallback and a phone viewport
 * never reaches either width; the 720px figure is only ever asserted for the
 * banner above, which really does center at that width.
 */
export default function Loading() {
  return (
    <>
      {/* RoundTypeEditor, closed pill — flush left, no gutter (see header note). */}
      <div className="mb-3">
        <Skeleton className="h-9 w-40 rounded-full" />
      </div>

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

        {/* Sticky scorecard chrome — FairwayScorecardHeader.tsx */}
        <div className="bg-elevated shadow-flat">
          {/* Mobile control row (lg:hidden, FairwayScorecardHeader.tsx:332-370):
              Prev + Exit (left cluster), "Hole X / Y" (right), Next (far right). */}
          <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-3 py-2">
            <div className="flex items-center gap-1.5">
              <Skeleton className="h-9 w-[4.5rem] rounded-full" />
              <Skeleton className="h-9 w-14 rounded-full" />
            </div>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-9 w-[4.5rem] rounded-full" />
          </div>

          {/* Hole strip — each cell min-w-[72px], four stacked text rows
              (number / par / yardage / score), plus the trailing Out/Total
              column (FairwayScorecardHeader.tsx:239-280, 382-389). */}
          <div className="flex items-stretch overflow-x-auto border-b border-border-subtle">
            {Array.from({ length: 9 }).map((_, i) => (
              <div
                key={i}
                className="flex min-w-[72px] shrink-0 flex-col items-center gap-1.5 border-r border-border-subtle px-2 py-2.5"
              >
                <Skeleton className="h-3 w-4" />
                <Skeleton className="h-2 w-9" />
                <Skeleton className="h-2 w-9" />
                <Skeleton className="mt-1 h-5 w-5" />
              </div>
            ))}
            <div className="flex min-w-[78px] shrink-0 flex-col items-center gap-1.5 border-r border-border-strong bg-surface-sunken px-2 py-2.5">
              <Skeleton className="h-3 w-8" />
              <Skeleton className="h-2 w-9" />
              <Skeleton className="h-2 w-9" />
              <Skeleton className="mt-1 h-5 w-6" />
            </div>
          </div>

          {/* belowSlot — FairwayShotPills: "Shot N" label over a dot track with
              one dominant current-shot chip (FairwayShotPills.tsx:92-98, 116-131). */}
          <div className="px-3 py-2.5">
            <Skeleton className="mb-1.5 h-2.5 w-12" />
            <div className="flex items-center gap-1.5">
              <Skeleton className="h-11 w-11 shrink-0 rounded-fw-md" />
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-1.5 w-1.5 shrink-0 rounded-full" />
              ))}
            </div>
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

          {/* Shot result — the one FairwayShotEntry section every hole state
              renders (FairwayShotEntry.tsx:317-370), inside its shadow Surface. */}
          <div className="mt-4 overflow-hidden rounded-card bg-surface shadow-soft">
            <div className="px-5 py-5">
              <Skeleton className="mb-3 h-3 w-24" />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-[52px] w-full rounded-fw-md" />
                ))}
              </div>
            </div>
          </div>

          {/* Sticky action bar — full-width primary + a secondary row
              (FairwayShotEntry.tsx:557-609). */}
          <div className="mt-1 space-y-2">
            <Skeleton className="h-11 w-full rounded-fw-md" />
            <div className="flex gap-2">
              <Skeleton className="h-11 flex-1 rounded-fw-md" />
              <Skeleton className="h-11 flex-1 rounded-fw-md" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
