import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback';

/* ============================================================================
 * Route Suspense fallback for the Player CoachHelm home
 * (/golf/dashboard/coachhelm).
 * ----------------------------------------------------------------------------
 * Task 8 (2026-07-19) moved this route onto the Spine & Stage chassis —
 * `PlayerCoachHelmHome` renders `PlayerSpine` beside a `StageRouter` whose
 * home view is `PlayerHomeBento`, no `CoachHelmShell` masthead/sub-nav wrapper
 * (see page.tsx: `fairwayScope(...)` → `mx-auto max-w-[1440px] px-4 py-5
 * md:px-6 md:py-6` → `<PlayerCoachHelmHome />` directly).
 *
 * Re-verified against source (this fallback had drifted from all three):
 *
 *  - Outer shell — `PlayerCoachHelmHome.tsx:412-414` wraps `{pageHeading}`
 *    (an sr-only `<h1>`, no visible shape) + `<PlayerCoachHelmNav />` +
 *    the Spine/Stage grid in one `flex min-w-0 flex-col gap-5`, rendered
 *    unconditionally once `hasData` (the settled shape this fallback is
 *    replaced by). `PlayerCoachHelmNav.tsx:71-115` renders a real `<nav>`
 *    with a `border-b border-border-subtle` strip and six `min-h-11`
 *    (44px) tab links — reproduced here as an aria-hidden row of six
 *    min-h-11 slots above the grid, inside the same outer flex-col gap-5.
 *
 *  - Grid — `PlayerCoachHelmHome.tsx:415`'s inner wrapper is `flex min-w-0
 *    flex-col gap-5 min-[940px]:grid min-[940px]:grid-cols-[280px_minmax(0,
 *    1fr)] min-[940px]:items-start min-[1180px]:grid-cols-[300px_minmax(0,
 *    1fr)]` — gap-5 (not gap-6), and the spine column is 280px until 1180px,
 *    not a flat 300px.
 *
 *  - Spine has TWO real renders, not one (`PlayerSpine.tsx`), and this
 *    fallback previously drew only the desktop one at every width, forcing
 *    a ~500px-tall dark rail onto mobile where the real page never shows
 *    it (a mobile-audit violation — rule 7):
 *      • `<940px` — a compact horizontal `<aside>` (`min-[940px]:hidden`):
 *        eyebrow/hero/verdict on the left + a "Log round" pill top-right,
 *        then priorities+ledger flattened into ONE wrapped row of pill
 *        chips below a hairline (`PlayerSpine.tsx`'s post-P-07 fix — it used
 *        to horizontally scroll and hide 48% of the row on a phone).
 *      • `≥940px` — `Spine.tsx`'s vertical rail (`rounded-fw-lg
 *        border-accent-700 bg-gradient-to-b ... shadow-raise`): eyebrow →
 *        hero → verdict → `StandingTrack` → `PriorityList` (3 rows) →
 *        `SpineLedger` (4 rows) → the pill CTA. `PlayerSpine` renders BOTH
 *        as literal siblings gated by `min-[940px]:hidden` / `hidden
 *        min-[940px]:block`, so this fallback reproduces both slots the
 *        same way instead of picking one shape for every width. Bars use
 *        `bg-text-on-accent/12` — a cream whisper on the deep-green band —
 *        so they read as "on-dark" content, not a mismatched light-surface
 *        skeleton; hairlines reuse Spine's own `oklch(1 0 0 / 0.14)` divider.
 *
 *  - Stage (`PlayerHomeBento.tsx`) is NOT the gapless `grid-cols-2
 *    min-[940px]:grid-cols-4` hairline-seam shell this fallback previously
 *    drew — it calls `<Bento separated className="min-[940px]:grid-cols-2">`.
 *    `separated` renders each cell as its OWN bordered/shadowed card on a
 *    `gap-3` grid, `bg-transparent` in between (no hairline seams), and the
 *    `min-[940px]:grid-cols-2` override (added #1049, before this file's own
 *    prior edit) beats Bento's default `min-[940px]:grid-cols-4` under
 *    tailwind-merge — the grid caps at 2 columns (`grid-cols-1
 *    sm:grid-cols-2`) at every width, never 4. The cell set also grew from 5
 *    to 8 and reordered: Performance snapshot (span 2, a 5-metric row) →
 *    Your edge this week (span 2) → Focus areas → Game profile → Standing
 *    (span 2) → Trend → Shot analysis → Insight library (span 2). The
 *    flag-gated Themes cell (also span 2, between Shot analysis and Insight
 *    library) stays omitted — not always present in the real grid.
 *
 *  - Cell anatomy — `BentoCell.tsx:52-107` always renders label → headline
 *    → children → sentence, in that order, and the trailing `sentence`
 *    paragraph (line 94-96) appears whenever the prop is a non-empty
 *    string. In `PlayerHomeBento.tsx` that string is unconditional (or
 *    always-truthy via a `??`/ternary fallback) for every cell except
 *    "Your edge this week" (no `sentence` prop at all, line 140) — so
 *    every other cell below ends in its own trailing `h-3 w-full` bar
 *    matching that line: Performance snapshot (line 128), Focus areas
 *    (line 189), Game profile (206-210), Standing (261-267), Trend
 *    (line 280), Shot analysis (line 294, where it's the cell's ONLY
 *    body content since that cell has no headline/children), and
 *    Insight library (line 314).
 * ========================================================================== */

const HAIRLINE_COLOR = 'oklch(1 0 0 / 0.14)';
const SPINE_BAR = 'bg-text-on-accent/12';
const CELL = 'rounded-card border border-border-subtle bg-surface px-[18px] py-4 shadow-soft';

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
            {/* Spine, mobile — PlayerSpine's compact <aside>, <940px only.
                Hero + verdict + pill CTA, then ONE wrapped row combining the
                3 priority chips + 4 ledger chips (7 total). */}
            <div
              aria-hidden="true"
              className="overflow-clip rounded-fw-lg border border-accent-700 bg-gradient-to-r from-accent-900 to-accent-800 p-4 min-[940px]:hidden"
            >
              <div className="flex min-w-0 items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <Skeleton className={`h-2.5 w-24 ${SPINE_BAR}`} />
                  <Skeleton className={`mt-1.5 h-7 w-20 ${SPINE_BAR}`} />
                  <Skeleton className={`mt-2 h-3.5 w-full ${SPINE_BAR}`} />
                </div>
                <Skeleton className={`h-8 w-24 shrink-0 rounded-full ${SPINE_BAR}`} />
              </div>
              <div className="mt-3 flex min-w-0 flex-wrap gap-2 border-t pt-3" style={{ borderTopColor: HAIRLINE_COLOR }}>
                {Array.from({ length: 7 }).map((_, i) => (
                  <Skeleton key={i} className={`h-6 w-20 shrink-0 rounded-full ${SPINE_BAR}`} />
                ))}
              </div>
            </div>

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

            {/* Stage — PlayerHomeBento's SEPARATED card grid (own borders +
                shadow-soft per cell, gap-3, capped at 2 columns at every
                width). 8 cells, real DOM order + spans. */}
            <div
              aria-hidden="true"
              className="grid grid-flow-dense grid-cols-1 gap-3 auto-rows-[minmax(7.375rem,auto)] sm:grid-cols-2"
            >
              {/* 1 · Performance snapshot — 5-metric row */}
              <div className={`${CELL} flex flex-col gap-2 sm:col-span-2`}>
                <Skeleton className="h-2.5 w-36" />
                <div className="grid grid-cols-2 gap-2 min-[520px]:grid-cols-5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex flex-col items-center gap-1 py-1">
                      <Skeleton className="h-4 w-9" />
                      <Skeleton className="h-2.5 w-12" />
                    </div>
                  ))}
                </div>
                <Skeleton className="h-3 w-full" />
              </div>

              {/* 2 · Your edge this week */}
              <div className={`${CELL} flex flex-col gap-2 sm:col-span-2`}>
                <Skeleton className="h-2.5 w-32" />
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-4/5" />
                <Skeleton className="h-14 w-full rounded-fw-md" />
                <div className="mt-auto flex gap-2 pt-1">
                  <Skeleton className="h-8 w-20 rounded-fw-md" />
                  <Skeleton className="h-8 w-20 rounded-fw-md" />
                </div>
              </div>

              {/* 3 · Focus areas */}
              <div className={`${CELL} flex flex-col gap-2`}>
                <Skeleton className="h-2.5 w-20" />
                <Skeleton className="h-6 w-10" />
                <div className="flex items-center gap-1">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} circle className="h-1.5 w-1.5" />
                  ))}
                </div>
                <Skeleton className="h-3 w-full" />
              </div>

              {/* 4 · Game profile */}
              <div className={`${CELL} flex flex-col gap-2`}>
                <Skeleton className="h-2.5 w-24" />
                <div className="flex items-center gap-3">
                  <Skeleton circle className="h-16 w-16 shrink-0" />
                  <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-3 w-full" />
                    ))}
                  </div>
                </div>
                <Skeleton className="h-3 w-full" />
              </div>

              {/* 5 · Standing */}
              <div className={`${CELL} flex flex-col gap-2 sm:col-span-2`}>
                <Skeleton className="h-2.5 w-16" />
                <Skeleton className="h-7 w-20" />
                <div className="flex flex-col gap-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Skeleton className="h-3 w-28" />
                      <Skeleton className="h-2.5 flex-1 rounded-full" />
                    </div>
                  ))}
                </div>
                <Skeleton className="h-3 w-full" />
              </div>

              {/* 6 · Trend */}
              <div className={`${CELL} flex flex-col gap-2`}>
                <Skeleton className="h-2.5 w-14" />
                <Skeleton className="h-6 w-24 rounded-full" />
                <Skeleton className="h-3 w-full" />
              </div>

              {/* 7 · Shot analysis */}
              <div className={`${CELL} flex flex-col gap-2`}>
                <Skeleton className="h-2.5 w-28" />
                <Skeleton className="h-3 w-full" />
              </div>

              {/* 8 · Insight library (flag-gated Themes cell, also span 2,
                  omitted — not always present in the real grid) */}
              <div className={`${CELL} flex flex-col gap-2 sm:col-span-2`}>
                <Skeleton className="h-2.5 w-24" />
                <Skeleton className="h-7 w-16" />
                <div className="flex gap-2">
                  <Skeleton className="h-6 w-24 rounded-full" />
                  <Skeleton className="h-6 w-24 rounded-full" />
                </div>
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
