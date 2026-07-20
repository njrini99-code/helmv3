import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';

/**
 * Route Suspense fallback for the Coach Team Brief (/dashboard/intelligence).
 *
 * Task 9 (2026-07-19) moved this route onto the Spine & Stage chassis —
 * `CoachIntelligenceHome` renders `CoachSpine` beside a `StageRouter` whose
 * home view is `CoachHomeBento`, with Signals/Players/Effectiveness folded
 * into `?view=` stage drills (no standalone `CoachHelmShell` masthead/sub-nav
 * wrapper here — see page.tsx: `fairwayScope(...)` → `mx-auto max-w-[1200px]
 * px-4 py-6 md:px-6` → `<CoachIntelligenceHome />` directly). This fallback
 * reproduces that exact container chain and the `300px 1fr` spine+stage grid.
 * This route is `force-dynamic` and awaits several sequential DB reads
 * before it can render at all, so this fallback is what actually paints
 * first on every navigation here.
 *
 * Visual-fidelity pass (2026-07-20): the two flat `h-[480px]` Skeleton slabs
 * are now shape-matched to what actually mounts inside them:
 *
 *  - Spine — `CoachSpine` wraps the `Spine` module on the same
 *    `rounded-fw-lg border border-accent-700 bg-gradient-to-b from-accent-900
 *    via-accent-800 to-accent-800 shadow-raise` surface `PlayerSpine` uses —
 *    never a neutral Skeleton block, or the brand green pops in on hydrate.
 *    Bars stand in for eyebrow ("Team Read") → hero figure → verdict →
 *    `PriorityList` (3 rows — CoachSpine has no `StandingTrack`, unlike
 *    PlayerSpine) → `SpineLedger` (3 rows: Players/Attention/Last analyzed)
 *    → the `children`-slot Trajectory row CoachSpine appends after its own
 *    hairline → the pill CTA. Bars use `bg-accent-700/40`; hairlines reuse
 *    Spine's own `oklch(1 0 0 / 0.14)` divider color.
 *  - Stage — `CoachHomeBento` (Bento.tsx + BentoCell.tsx) is the same
 *    gapless `grid-cols-2 min-[940px]:grid-cols-4
 *    auto-rows-[minmax(7.375rem,auto)]` shell PlayerHomeBento uses. This
 *    fallback reproduces the shell plus 5 cells in CoachHomeBento.tsx's own
 *    DOM order and `col-span-2`/`row-span-2` markers (weakest category 2×2,
 *    roster, signals, effectiveness, ask CoachHelm) — `grid-flow-dense`
 *    auto-placement then lands them in the identical slots the real cells
 *    occupy (a clean 2-row fit at the 4-col breakpoint, no manual math).
 */

const HAIRLINE_COLOR = 'oklch(1 0 0 / 0.14)';
const SPINE_BAR = 'bg-accent-700/40';

export default function IntelligenceLoading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient font-fw-sans')}>
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6">
        <div
          role="status"
          aria-busy="true"
          aria-live="polite"
          className="flex flex-col gap-6 min-[940px]:grid min-[940px]:grid-cols-[300px_1fr] min-[940px]:items-start"
        >
          <span className="sr-only">Loading team brief…</span>

          {/* Spine — eyebrow / hero / verdict / priorities / ledger / trajectory / CTA */}
          <div
            aria-hidden="true"
            className="flex flex-col rounded-fw-lg border border-accent-700 bg-gradient-to-b from-accent-900 via-accent-800 to-accent-800 p-6 shadow-raise min-[940px]:sticky min-[940px]:top-20"
          >
            <Skeleton className={`h-2.5 w-24 ${SPINE_BAR}`} />
            <Skeleton className={`mt-2.5 h-9 w-24 ${SPINE_BAR}`} />
            <Skeleton className={`mt-2.5 h-3.5 w-full ${SPINE_BAR}`} />

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
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center justify-between gap-3">
                  <Skeleton className={`h-3 w-20 ${SPINE_BAR}`} />
                  <Skeleton className={`h-3 w-10 ${SPINE_BAR}`} />
                </div>
              ))}
            </div>

            <hr className="my-5 border-t" style={{ borderTopColor: HAIRLINE_COLOR }} />
            <Skeleton className={`h-2.5 w-20 ${SPINE_BAR}`} />
            <Skeleton className={`mt-1.5 h-3.5 w-full ${SPINE_BAR}`} />
            <Skeleton className={`mt-1.5 h-3.5 w-3/4 ${SPINE_BAR}`} />

            <Skeleton className={`mt-5 h-10 w-full rounded-full ${SPINE_BAR}`} />
          </div>

          {/* Stage — gapless bento shell: weakest category 2×2, roster, signals, effectiveness, ask */}
          <div
            aria-hidden="true"
            className="grid grid-flow-dense grid-cols-2 gap-px overflow-hidden rounded-card border border-border-subtle bg-border-subtle [box-shadow:var(--fw-shadow-card)] auto-rows-[minmax(7.375rem,auto)] min-[940px]:grid-cols-4"
          >
            <div className="col-span-2 row-span-2 flex flex-col gap-2 bg-surface px-[18px] py-4">
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-2.5 w-32" />
                <Skeleton className="h-4 w-12 rounded-full" />
              </div>
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-4/5" />
              <Skeleton className="mt-auto h-24 w-full rounded-fw-sm" />
            </div>

            <div className="flex flex-col gap-2 bg-surface px-[18px] py-4">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-3 w-full" />
            </div>

            <div className="flex flex-col gap-2 bg-surface px-[18px] py-4">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-6 w-12" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-2 w-full rounded-full" />
            </div>

            <div className="flex flex-col gap-2 bg-surface px-[18px] py-4">
              <Skeleton className="h-2.5 w-24" />
              <Skeleton className="h-6 w-14" />
              <Skeleton className="h-3 w-4/5" />
            </div>

            <div className="flex flex-col gap-2 bg-surface px-[18px] py-4">
              <Skeleton className="h-2.5 w-28" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/5" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
