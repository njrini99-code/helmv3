import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';
import { Surface } from '@/components/fairway/surfaces/surface';

/**
 * P206 — the Suspense fallback for the Round detail matches the LIVE Fairway
 * layout: a max-w-[1100px] shell with a ViewHeader masthead (title column +
 * an always-present actions cluster), the RoundTypeEditor's closed-state
 * pill, a focal InstrumentCluster, then a matte Scorecard Surface.
 *
 * Masthead: ViewHeader always renders `primaryAction` ("Open full review")
 * and `secondaryActions` ("All stats") unguarded
 * (FairwayRoundDetail.tsx:372-377), and its own layout
 * (`flex flex-col ... sm:flex-row sm:items-start sm:justify-between`,
 * view-header.tsx:262-267) stacks that actions cluster as a distinct row
 * below the title column on any viewport under `sm` — reproduced here as a
 * second flex child instead of folding into the title block.
 *
 * RoundTypeEditor: page.tsx redirects away before rendering unless
 * `isCoach || isOwnRound` (page.tsx:157-158), and `canChangeType` is exactly
 * that same expression (page.tsx:186), so every render that reaches this
 * fallback already has `canChangeType === true` — the closed-state
 * `Button variant="secondary" size="sm"` (RoundTypeEditor.tsx:227-238)
 * always mounts directly under the masthead (FairwayRoundDetail.tsx:388-400)
 * and gets its own reserved skeleton pill here.
 *
 * FairwayRoundDetail's InstrumentCluster is `primary` (the score hero) +
 * `secondary` (ONE "Front / Back" panel, flanking rail) + `tertiary` (3
 * micro-readouts: GIR / Fairways / Putts). The tertiary foot row's grouped-
 * ledger chrome (TERTIARY_PHONE_GROUP) is `max-sm:`-scoped in its entirety
 * (InstrumentCluster.tsx:80-90): below `sm` it is ONE bordered group with a
 * 2-up grid whose 3rd cell spans both columns; from `sm` that group chrome
 * disappears and each cell is its own individually-bordered InstrumentPanel
 * (StatStrip count=3 -> `sm:grid-cols-2 lg:grid-cols-3`,
 * StatStrip.tsx:163-185). Reproduced below: hero panel, one Front/Back-shaped
 * panel beside it, then a foot row that carries the group chrome only below
 * `sm` and gives each cell its own border from `sm` up.
 *
 * Scorecard: ScorecardNine has its own commented Rule-8 breakpoint split
 * (FairwayRoundDetail.tsx:1041-1096 `md:hidden` vs. FairwayRoundDetail.tsx:
 * 1099-1179 `hidden ... md:block`) — below `md` it is per-hole row strips in
 * a `<ul>` (ScorecardHoleRow, FairwayRoundDetail.tsx:1188-1194) plus a
 * totals bar, never the desktop table squeezed into a scroll box; from `md`
 * it is the original matte table (row-label + 9 hole columns + total).
 * Reproduced below with the same `md:hidden` / `hidden md:block` boundary.
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
          {/* Masthead (ViewHeader shape) — ViewHeader's own container is
              `flex flex-col ... sm:flex-row sm:items-start sm:justify-between`
              (view-header.tsx:262-267) with the title column as one flex
              child and, whenever either action prop is set, an "actions"
              cluster as a SECOND flex child (view-header.tsx:338-371).
              FairwayRoundDetail always passes both `primaryAction`
              ("Open full review") and `secondaryActions` ("All stats") with
              no guard (FairwayRoundDetail.tsx:372-377), so that cluster
              always renders and, below `sm`, stacks as its own row under the
              title/description rather than living inside a single line. */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-9 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2 sm:ml-auto sm:justify-end">
              {/* DOM order mirrors view-header.tsx:349-367: secondary
                  ("All stats", narrow) first, primary ("Open full review",
                  wide) second, each carrying the same order-2/order-1 +
                  sm:order-none pair — below `sm` that flips visual order to
                  primary-then-secondary; from `sm` the order classes go
                  inert and visual order reverts to DOM order
                  (secondary-then-primary). */}
              <Skeleton className="order-2 h-9 w-20 sm:order-none" />
              <Skeleton className="order-1 h-9 w-32 sm:order-none" />
            </div>
          </div>

          {/* RoundTypeEditor, closed state — a `Button variant="secondary"
              size="sm"` reading "Change round type"
              (RoundTypeEditor.tsx:227-238). FairwayRoundDetail mounts it
              unconditionally under `canChangeType`
              (FairwayRoundDetail.tsx:388-400), and page.tsx redirects away
              before that point whenever both `isCoach` and `isOwnRound` are
              false (page.tsx:157-158) then sets
              `canChangeType = isCoach || !!isOwnRound` (page.tsx:186) — so on
              every render that reaches this fallback, `canChangeType` is
              already guaranteed true and the control always mounts here. */}
          <div className="-mt-6">
            <Skeleton className="h-9 w-36" />
          </div>

          {/* Hero — focal InstrumentCluster: primary score panel + Front/Back
              rail (deck), then the 3-item tertiary ledger (foot row). */}
          <div className="flex flex-col gap-5 sm:gap-6">
            <div className="grid grid-cols-1 gap-5 sm:gap-6 lg:grid-cols-[2fr_minmax(15rem,1fr)]">
              {/* Primary — the score hero */}
              <div className="rounded-card border border-border-subtle bg-surface p-6">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-4 h-16 w-32" />
                <Skeleton className="mt-4 h-4 w-20" />
              </div>
              {/* Secondary rail — the "Front / Back" panel */}
              <div className="rounded-card border border-border-subtle bg-surface p-5">
                <Skeleton className="h-3 w-24" />
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-full" />
                </div>
              </div>
            </div>
            {/* Tertiary foot row (GIR / Fairways / Putts) — every grouping
                class on TERTIARY_PHONE_GROUP is `max-sm:`-scoped
                (InstrumentCluster.tsx:80-90), so the single bordered ledger
                with chrome-less cells is a PHONE-ONLY shape: from `sm` up
                each cell is its own individually-bordered InstrumentPanel
                (StatStrip.tsx count=3 -> `sm:grid-cols-2 lg:grid-cols-3`,
                StatStrip.tsx:178-185, with the trailing cell spanning both
                columns until `lg` gives it its own column,
                StatStrip.tsx:163-164). Below `sm`: one bordered group, 2-up
                grid, 3rd cell spans full width. From `sm`: no outer
                group chrome, 2 individually-bordered cells (3rd spanning).
                From `lg`: 3 individually-bordered cells across. */}
            <div className="rounded-card border border-border-subtle bg-surface p-4 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0">
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
                <div className="sm:rounded-card sm:border sm:border-border-subtle sm:bg-surface sm:p-4">
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="mt-2 h-8 w-16" />
                </div>
                <div className="sm:rounded-card sm:border sm:border-border-subtle sm:bg-surface sm:p-4">
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="mt-2 h-8 w-16" />
                </div>
                <div className="col-span-2 sm:rounded-card sm:border sm:border-border-subtle sm:bg-surface sm:p-4 lg:col-span-1">
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="mt-2 h-8 w-16" />
                </div>
              </div>
            </div>
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

