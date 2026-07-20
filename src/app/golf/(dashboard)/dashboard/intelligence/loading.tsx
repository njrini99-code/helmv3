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
 * reproduces that exact container chain and the `300px 1fr` spine+stage grid
 * — the same two-block shape `StatsSpineStage` renders for its own
 * client-side loading state (see StatsSpineStage.tsx ~L210-217) — so this
 * route's fallback and the eventual spine/stage content share one footprint
 * with no layout shift. This route is `force-dynamic` and awaits several
 * sequential DB reads before it can render at all, so this fallback is what
 * actually paints first on every navigation here.
 */
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
          <Skeleton className="h-[480px] rounded-fw-lg min-[940px]:sticky min-[940px]:top-20" />
          <Skeleton className="h-[480px] rounded-fw-lg" />
        </div>
      </div>
    </div>
  );
}
