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
 * that exact container chain and the `300px 1fr` spine+stage grid — the same
 * two-block shape `StatsSpineStage` renders for its own client-side loading
 * state (see StatsSpineStage.tsx ~L210-217) — so the route fallback and the
 * eventual spine/stage content share one footprint with no layout shift.
 * ========================================================================== */

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
          <Skeleton className="h-[480px] rounded-fw-lg min-[940px]:sticky min-[940px]:top-20" />
          <Skeleton className="h-[480px] rounded-fw-lg" />
        </div>
      </div>
    </div>
  );
}
