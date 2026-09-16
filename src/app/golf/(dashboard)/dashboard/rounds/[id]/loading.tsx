import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';
import { Surface } from '@/components/fairway/surfaces/surface';

/**
 * P206 — the Suspense fallback for the Round detail matches the LIVE Fairway
 * layout: a max-w-[1100px] shell with a ViewHeader masthead (title column +
 * a primary CTA + an overflow menu trigger), a single focal score
 * InstrumentPanel, then a matte Scorecard Surface.
 *
 * Masthead (facelift, 2026-09): ViewHeader renders exactly ONE
 * `primaryAction` ("Open full review") plus a `secondaryActions` overflow
 * `Menu` trigger (an `IconButton`) that carries "All stats" and, when
 * `canChangeType`, "Change round type" as menu items — no separate
 * standalone "Change round type" pill under the masthead anymore
 * (FairwayRoundDetail.tsx's masthead block). Reproduced here as a title
 * column plus a small icon-button-shaped skeleton.
 *
 * Hero: the InstrumentCluster (score + Front/Back rail + GIR/Fairways/Putts
 * foot row) was replaced by ONE focal `InstrumentPanel` (score readout +
 * grade dots + "course · date · player" line), followed by either a
 * Filmstrip + 5-column StatMatrix (when hole data exists) or a single
 * InlineNotice (when it doesn't). This fallback can't know which branch the
 * real data will take, so it reproduces the hero panel plus the
 * Filmstrip/StatMatrix shape — the more detailed of the two branches — as
 * the closer skeleton approximation of a typical (played) round.
 *
 * Scorecard: ScorecardNine has its own commented Rule-8 breakpoint split
 * (FairwayRoundDetail.tsx's `md:hidden` vs. `hidden ... md:block` — search
 * ScorecardNine) — below `md` it is per-hole row strips in a `<ul>` (one
 * `<li>` per hole via ScorecardHoleRow) plus a totals bar, never the desktop
 * table squeezed into a scroll box; from `md` it is the original matte table
 * (row-label + 9 hole columns + total). Reproduced below with the same
 * `md:hidden` / `hidden md:block` boundary.
 */
export default function Loading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto w-full max-w-[1100px] px-4 py-6 md:px-6"
      >
        <span className="sr-only">Loading round…</span>
        <div className="flex flex-col gap-10">
          {/* Masthead (ViewHeader shape) — title column as one flex child,
              a SECOND flex child carrying exactly one primary CTA
              ("Open full review") plus one overflow-menu `IconButton`
              trigger (never a separate "All stats"/"Change round type"
              pill — those are menu items now). */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-9 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2 sm:ml-auto sm:justify-end">
              <Skeleton className="order-2 h-11 w-11 shrink-0 rounded-full sm:order-none" />
              <Skeleton className="order-1 h-11 w-32 sm:order-none" />
            </div>
          </div>

          {/* Hero — ONE focal score InstrumentPanel (readout + grade dots +
              course · date · player line). */}
          <div className="rounded-card border border-border-subtle bg-surface p-6">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-4 h-16 w-32" />
            <Skeleton className="mt-4 h-3.5 w-28" />
            <Skeleton className="mt-3 h-4 w-56" />
          </div>

          {/* Filmstrip + 5-column StatMatrix breakdown (the hole-data
              branch — the closer approximation for a typical played round;
              the no-hole-data branch is a single InlineNotice instead). */}
          <div className="flex gap-2 overflow-hidden">
            {Array.from({ length: 9 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-8 shrink-0 rounded-fw-sm" />
            ))}
          </div>
          <div className="grid grid-cols-2 overflow-hidden rounded-fw-md bg-surface-sunken sm:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5 px-3 py-3">
                <Skeleton className="h-6 w-10" />
                <Skeleton className="h-3 w-12" />
              </div>
            ))}
          </div>

          {/* Scorecard — ScorecardNine has an explicit, commented Rule-8
              breakpoint split (FairwayRoundDetail.tsx:1041-1096, `md:hidden`
              vs. `hidden ... md:block`): below `md` it is per-hole ROW
              STRIPS in a `<ul>` (one `<li>` per hole via ScorecardHoleRow,
              FairwayRoundDetail.tsx:1188-1194) plus a totals bar — never a
              grid of small cells — and from `md` up it is the original
              `<table>` (row-label + 9 hole columns + total). Reproduced
              below with the same `md:hidden` / `hidden md:block` boundary. */}
          <section className="flex flex-col gap-3">
            <Skeleton className="h-3 w-24" />
            <Surface padding="none" elevation="border" className="overflow-hidden">
              {/* Phone — per-hole row strips (FairwayRoundDetail.tsx:1064-1096) */}
              <div className="flex flex-col md:hidden">
                {[0, 1].map((nine) => (
                  <div key={nine} className="flex flex-col gap-2 px-3 py-3">
                    <div className="flex items-center justify-between px-1">
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="h-3 w-12" />
                    </div>
                    <div className="divide-y divide-border-subtle">
                      {Array.from({ length: 9 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-2.5 py-2.5">
                          <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                          <Skeleton className="h-8 flex-1" />
                        </div>
                      ))}
                    </div>
                    <Skeleton className="mt-1 h-10 w-full rounded-fw-md" />
                  </div>
                ))}
              </div>
              {/* md+ — the original matte table shape (FairwayRoundDetail.tsx:1099-1179) */}
              <div className="hidden overflow-x-auto px-2 py-3 md:block">
                <div className="space-y-4">
                  {[0, 1].map((nine) => (
                    <div key={nine} className="space-y-2">
                      <Skeleton className="h-4 w-16" />
                      <div className="grid grid-cols-10 gap-2">
                        {Array.from({ length: 10 }).map((_, i) => (
                          <Skeleton key={i} className="h-6 w-full" />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Surface>
          </section>
        </div>
      </div>
    </div>
  );
}

