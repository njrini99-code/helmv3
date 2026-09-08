import { Skeleton } from '@/components/fairway';
import { fairwayScope } from '@/lib/redesign/flag';

/**
 * Route Suspense fallback for /golf/dashboard/rounds/new.
 *
 * page.tsx is an async server component that awaits session data, then
 * renders `<NewRoundClient>` (new-round-client.tsx:137, `'use client'`).
 * Next swaps this fallback for NewRoundClient's own FIRST render, not a
 * later state — so this shape-matches that initial render, not the
 * settled/populated screen.
 *
 * At mount, new-round-client.tsx initializes: `step` = 'setup'
 * (new-round-client.tsx:237), `courseMode` = 'new' (:803),
 * `loadingSavedCourses` = true / `savedCourses` = [] (:799-800),
 * `recentCourses` = [] (:802), `allActiveQualifiers` = [] /
 * `loadingActiveQualifiers` = true (:727,729), `setupData.roundType` =
 * 'practice' (:245), `holesPerRound` = 18 (:255). It renders
 * FairwayNewRoundEntry (FairwayNewRoundEntry.tsx) with `step="setup"`,
 * which at THOSE prop values renders:
 *   - CockpitBand (:262-306): the dark bg-nav-bg/on-dark band, a persistent
 *     "Dashboard" back row, eyebrow/title/description, then StepSpine
 *     (:230-259).
 *   - the primary "Browse course library" CTA (:443-454) — the recent-
 *     courses quick-pick row at :456 does not render, `recentCourses` is
 *     still empty.
 *   - the Course card (`Surface elevation="shadow" padding="lg"`, :469):
 *     `showSelector` is false (:389, `loadingSavedCourses` hasn't resolved),
 *     so the Segmented saved/new toggle and the saved-course search+list
 *     (:475-584) do NOT render; `courseMode` is 'new', so the card shows
 *     the manual course-entry form instead (:665-784) — Course name,
 *     City/State, Rating/Slope/Tees, and the "Save for quick access" row.
 *   - the "Active qualifiers" card (:789) does not render — its own gate,
 *     `!loadingActiveQualifiers`, is false at mount.
 *   - the "Round details" card (:830-894): Round type + Date, then a Holes
 *     9/18 Segmented control — the front/back nine sub-toggle stays hidden,
 *     `holesPerRound` defaults to 18, not 9.
 *   - the Qualifier-selection card (:897) does not render, `roundType`
 *     defaults to 'practice', not 'qualifier'.
 *   - the quiet "50+ stats tracked" note (:989-995).
 *   - the Cancel / "Next: configure holes →" action dock (:1034-1052) —
 *     `preloadedHoleConfigs` starts `null` (new-round-client.tsx:824), so
 *     `seededHoles` is undefined and the label is "Next…", not "Start…".
 *
 * `Surface elevation="shadow"` (surface.tsx) is a BORDERLESS `bg-surface`
 * card lit by `shadow-soft` (never a border at that elevation) — every card
 * below uses `shadow-soft`, not a border. Every field control below is
 * `h-11`: `fwInputCls` (FairwayNewRoundEntry.tsx:154) carries `min-h-0`,
 * which lands AFTER `ui/input.tsx`'s `min-h-[48px]` base in the `cn(...,
 * className)` merge (input.tsx:170-176) — twMerge keeps the later class, so
 * the real field height is content-driven: `text-body`'s 24px line-height
 * (tailwind.config.ts) + `py-2.5` (20px) + a 1px border ≈ 46px, not 48px.
 */
export default function NewRoundLoading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto w-full max-w-2xl px-4 pb-6 pt-[max(1.5rem,calc(env(safe-area-inset-top,0px)+0.75rem))] md:py-10"
      >
        <span className="sr-only">Loading new round…</span>

        <div className="flex flex-col gap-6">
          {/* Cockpit band — on-dark, matches bg-nav-bg exactly so the real
              band doesn't "pop in" a different color once it hydrates. The
              back row is a fixed 44px tap target (CockpitBand's onBack
              UIButton, :282-293) reserved above the eyebrow line. */}
          <div className="on-dark relative overflow-hidden rounded-card bg-nav-bg p-7 shadow-soft md:p-8">
            <Skeleton className="mb-3 h-11 w-24 bg-nav-text-dim/20" />
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

          {/* Course card — manual "new course" entry form. courseMode
              starts 'new' and loadingSavedCourses starts true, so the
              saved/new toggle + search + saved-course list never appear at
              mount; the card is always the raw form fields. */}
          <div className="flex flex-col gap-4 rounded-card bg-surface p-8 shadow-soft">
            <Skeleton className="h-5 w-20" />
            <div>
              <Skeleton className="mb-1.5 h-3 w-28" />
              <Skeleton className="h-11 w-full rounded-fw-md" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Skeleton className="mb-1.5 h-3 w-8" />
                <Skeleton className="h-11 rounded-fw-md" />
              </div>
              <div>
                <Skeleton className="mb-1.5 h-3 w-10" />
                <Skeleton className="h-11 rounded-fw-md" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div>
                <Skeleton className="mb-1.5 h-3 w-12" />
                <Skeleton className="h-11 rounded-fw-md" />
              </div>
              <div>
                <Skeleton className="mb-1.5 h-3 w-10" />
                <Skeleton className="h-11 rounded-fw-md" />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <Skeleton className="mb-1.5 h-3 w-8" />
                <Skeleton className="h-11 rounded-fw-md" />
              </div>
            </div>
            <Skeleton className="h-16 w-full rounded-fw-md" />
          </div>

          {/* Round details card — always renders; Active qualifiers (:789)
              and Qualifier round (:897) don't, so they're omitted here. */}
          <div className="flex flex-col gap-4 rounded-card bg-surface p-8 shadow-soft">
            <Skeleton className="h-5 w-32" />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Skeleton className="mb-1.5 h-3 w-20" />
                <Skeleton className="h-11 rounded-fw-md" />
              </div>
              <div>
                <Skeleton className="mb-1.5 h-3 w-10" />
                <Skeleton className="h-11 rounded-fw-md" />
              </div>
            </div>
            <div>
              <Skeleton className="mb-1.5 h-3 w-10" />
              <Skeleton className="h-9 w-full rounded-fw-sm" />
            </div>
          </div>

          {/* Quiet "50+ stats tracked" note */}
          <div className="flex flex-col gap-1.5 px-1">
            <Skeleton className="h-3.5 w-full max-w-sm" />
            <Skeleton className="h-3.5 w-2/3 max-w-xs" />
          </div>

          {/* Action dock — Cancel / Next */}
          <div className="flex gap-3 pt-1">
            <Skeleton className="h-11 flex-1 rounded-full" />
            <Skeleton className="h-11 flex-[2] rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
