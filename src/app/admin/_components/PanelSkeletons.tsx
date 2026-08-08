import { Skeleton, SkeletonList, SkeletonStat } from '@/components/fairway';
import { cn } from '@/lib/utils';

/**
 * Shape-matched Suspense fallbacks for `<PanelBoundary skeleton>`.
 *
 * `PanelBoundary` used to default `skeleton` to a single `<SkeletonStat/>` —
 * one metric card. That was the right shape for exactly one kind of panel, and
 * 25 of the 34 boundaries in the Bridge omitted the prop: full page bodies, the
 * 20-row deploys table and the feature dot grid all pre-painted as one small
 * card and then jumped on swap. The prop is now required; these are the two
 * shapes that repeat often enough across /admin to be worth naming, built only
 * from the Fairway skeleton primitives (src/components/fairway/feedback/
 * Skeleton.tsx). Anything rarer passes its own fallback at the call site.
 */

/**
 * The KPI strip every Bridge tab opens with. The grid recipes mirror
 * `StatStrip`'s own phone shapes — 2-up on a phone, and for the 3-peer case the
 * last cell spans both columns instead of leaving a ragged trailing gap
 * (docs/MOBILE_DOCTRINE.md rule 11, the same recipe admin/deploys' WebVitals
 * strip already hand-writes). Reserving the wrong number of rows is the one
 * thing worse than reserving none.
 */
export function PanelStatsSkeleton({ count = 4 }: { count?: 2 | 3 | 4 }) {
  const grid =
    count === 2
      ? 'grid-cols-2'
      : count === 3
        ? 'grid-cols-2 [&>*:last-child]:col-span-2 sm:grid-cols-3 sm:[&>*:last-child]:col-span-1'
        : 'grid-cols-2 sm:grid-cols-4';

  return (
    <div className={cn('grid gap-3', grid)}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonStat key={i} />
      ))}
    </div>
  );
}

/**
 * A whole page body — `<GolfBody/>`, `<JobsBody/>`, the detail pages' `<Body/>`.
 * Every Bridge tab is built the same way: a short masthead, a KPI strip, then
 * one long feed or table, so this reserves that RHYTHM rather than any one
 * tab's exact cell count.
 *
 * `stats={0}` for the bodies that open straight into a feed (the work log, a
 * filtered timeline) — reserving a KPI row that never arrives is the same
 * defect as the old single-card default, just in the other direction.
 */
export function PanelPageSkeleton({
  stats = 4,
  rows = 6,
}: {
  stats?: 0 | 2 | 3 | 4;
  rows?: number;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-7 w-2/3 max-w-md" />
      </div>
      {stats === 0 ? null : <PanelStatsSkeleton count={stats} />}
      <SkeletonList rows={rows} />
    </div>
  );
}
