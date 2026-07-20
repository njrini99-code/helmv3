import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback';

/* ============================================================================
 * Route Suspense fallback for the Player CoachHelm home
 * (/golf/dashboard/coachhelm).
 * ----------------------------------------------------------------------------
 * Task 8 (2026-07-19) moved this route onto the Spine & Stage chassis —
 * `PlayerCoachHelmHome` renders `PlayerSpine` beside a `StageRouter` whose
 * home view is `PlayerHomeBento`, no `CoachHelmShell` masthead/sub-nav wrapper
 * (see page.tsx: `fairwayScope(...)` → `mx-auto max-w-[1200px] px-4 py-6
 * md:px-6` → `<PlayerCoachHelmHome />` directly). This fallback reproduces
 * that exact container chain and the `300px 1fr` spine+stage grid.
 *
 * Visual-fidelity pass (2026-07-20): the two flat `h-[480px]` Skeleton slabs
 * are now shape-matched to what actually mounts inside them, so there is no
 * layout jump AND no color/shape pop when the real content hydrates:
 *
 *  - Spine — `PlayerSpine` is a thin wrapper over the `Spine` module
 *    (Spine.tsx), which renders on the real `rounded-fw-lg border
 *    border-accent-700 bg-gradient-to-b from-accent-900 via-accent-800
 *    to-accent-800 shadow-raise` surface — never a neutral Skeleton block,
 *    or the brand green itself would "pop in". Bars stand in for eyebrow →
 *    hero figure → verdict → `StandingTrack` (rail + you/team labels) →
 *    `PriorityList` (3 ranked rows) → `SpineLedger` (4 rows: Rounds/
 *    Fairways/Greens/Putts) → the pill CTA, in the same order Spine.tsx
 *    renders them. Bars use `bg-accent-700/40` (a lighter tint of the
 *    spine's own accent scale) so they read as "on-dark" content, not a
 *    mismatched light-surface skeleton; hairlines reuse Spine's own
 *    `oklch(1 0 0 / 0.14)` divider color.
 *  - Stage — `PlayerHomeBento` (Bento.tsx + BentoCell.tsx) is a gapless
 *    `grid-cols-2 min-[940px]:grid-cols-4 auto-rows-[minmax(7.375rem,auto)]`
 *    shell with `gap-px` hairline seams. This fallback reproduces that exact
 *    shell plus 5 cells in the SAME DOM order and `col-span-2`/`row-span-2`
 *    markers PlayerHomeBento.tsx uses (top insight 2×2, focus areas, game
 *    profile, standing 2×1, trend) — CSS `grid-flow-dense` auto-placement
 *    then lands the skeleton cells in the identical slots the real cells
 *    occupy, with no manual row/col math needed. The flag-gated Themes cell
 *    is intentionally omitted (not always present in the real grid).
 * ========================================================================== */

const HAIRLINE_COLOR = 'oklch(1 0 0 / 0.14)';
const SPINE_BAR = 'bg-accent-700/40';

export default function CoachHelmLoading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient font-fw-sans')}>
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6">
        <div
          role="status"
          aria-busy="true"
          aria-live="polite"
          className="flex flex-col gap-6 min-[940px]:grid min-[940px]:grid-cols-[300px_1fr] min-[940px]:items-start"
        >
          <span className="sr-only">Loading CoachHelm…</span>

          {/* Spine — eyebrow / hero / verdict / standing track / priorities / ledger / CTA */}
          <div
            aria-hidden="true"
            className="flex flex-col rounded-fw-lg border border-accent-700 bg-gradient-to-b from-accent-900 via-accent-800 to-accent-800 p-6 shadow-raise min-[940px]:sticky min-[940px]:top-20"
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

          {/* Stage — gapless bento shell: top insight 2×2, focus areas, game profile, standing 2×1, trend */}
          <div
            aria-hidden="true"
            className="grid grid-flow-dense grid-cols-2 gap-px overflow-hidden rounded-card border border-border-subtle bg-border-subtle [box-shadow:var(--fw-shadow-card)] auto-rows-[minmax(7.375rem,auto)] min-[940px]:grid-cols-4"
          >
            <div className="col-span-2 row-span-2 flex flex-col gap-2 bg-surface px-[18px] py-4">
              <Skeleton className="h-2.5 w-32" />
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-4/5" />
              <Skeleton className="h-3.5 w-3/5" />
              <div className="mt-auto flex gap-2 pt-1">
                <Skeleton className="h-8 w-20 rounded-fw-md" />
                <Skeleton className="h-8 w-20 rounded-fw-md" />
              </div>
            </div>

            <div className="flex flex-col gap-2 bg-surface px-[18px] py-4">
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="h-6 w-10" />
              <Skeleton className="h-3 w-full" />
            </div>

            <div className="flex flex-col gap-2 bg-surface px-[18px] py-4">
              <Skeleton className="h-2.5 w-24" />
              <Skeleton className="h-24 w-full rounded-fw-sm" />
              <Skeleton className="h-3 w-4/5" />
            </div>

            <div className="col-span-2 flex flex-col gap-2 bg-surface px-[18px] py-4">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-3 w-3/4" />
            </div>

            <div className="flex flex-col gap-2 bg-surface px-[18px] py-4">
              <Skeleton className="h-2.5 w-14" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/5" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
