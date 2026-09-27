/**
 * ============================================================================
 * StatsSpineStageSkeleton — the shape-matched loading state for Stats (DASH-08)
 * ----------------------------------------------------------------------------
 * The stats route used to wait on two 480px grey slabs, so the spine and the
 * bento reflowed completely when data landed. This renders the SAME geometry
 * as the loaded page, with Skeleton leaves in place of text:
 *
 *   scope row  → "Stats for" + one Select (StatsSpineStage's round picker)
 *   spine      → the frosted Spine card: eyebrow, hero number + direction
 *                chip, 2-line verdict, standing track + labels, 3 ranked
 *                priorities, the 4-up ledger stat row, the CTA pill
 *   stage      → the StatsBento grid: two 2-wide cells, five single cells,
 *                two 2-wide cells, on the same `Bento separated` rhythm
 *
 * Shared by the route fallback (`stats/loading.tsx`) and StatsSpineStage's
 * own first-load branch, so the two can never drift apart. No hooks, so it is
 * safe in a server `loading.tsx`.
 * ========================================================================== */

import { Skeleton } from '@/components/fairway/feedback/Skeleton';
import { cn } from '@/lib/utils';

/** Cell spans in StatsBento order (2 = two columns wide). */
const BENTO_SPANS = [2, 2, 1, 1, 1, 1, 1, 2, 2] as const;

export function StatsScopeRowSkeleton() {
  return (
    <div data-slot="stats-round-scope-skeleton" className="flex flex-wrap items-center gap-2">
      <Skeleton className="h-4 w-14 rounded-fw-sm" />
      <Skeleton className="h-9 w-full rounded-fw-sm sm:w-[17rem]" />
    </div>
  );
}

function SpineSkeleton({ className }: { className?: string }) {
  return (
    <div
      data-slot="spine-skeleton"
      className={cn('rounded-fw-lg border border-border-subtle bg-surface p-6 shadow-soft', className)}
    >
      {/* eyebrow → hero figure + direction chip → 2-line verdict */}
      <Skeleton className="h-4 w-28 rounded-fw-sm" />
      <div className="mt-2 flex items-center gap-2">
        <Skeleton className="h-14 w-32 rounded-fw-sm" />
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
      <Skeleton className="mt-3 h-4 w-full rounded-fw-sm" />
      <Skeleton className="mt-1.5 h-4 w-3/4 rounded-fw-sm" />
      <div className="my-5 h-px bg-border-subtle" />
      {/* standing track: rail + label row */}
      <Skeleton className="h-[7px] w-full rounded-full" />
      <Skeleton className="mt-[7px] h-3 w-1/2 rounded-fw-sm" />
      <div className="my-5 h-px bg-border-subtle" />
      {/* priorities: eyebrow + 3 rows (rank circle · title · value) */}
      <Skeleton className="mb-3 h-4 w-20 rounded-fw-sm" />
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="grid grid-cols-[1.5rem_1fr_auto] items-center gap-3">
            <Skeleton className="h-6 w-6 rounded-full" />
            <Skeleton className="h-4 w-full rounded-fw-sm" />
            <Skeleton className="h-3.5 w-10 rounded-fw-sm" />
          </div>
        ))}
      </div>
      <div className="my-5 h-px bg-border-subtle" />
      {/* ledger: 4-up stat row, value on top, label below */}
      <div className="grid grid-cols-4 gap-x-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <Skeleton className="h-6 w-10 rounded-fw-sm" />
            <Skeleton className="h-3 w-12 max-w-full rounded-fw-sm" />
          </div>
        ))}
      </div>
      <Skeleton className="mt-5 h-10 w-full rounded-full" />
    </div>
  );
}

function BentoSkeleton() {
  return (
    <div
      data-slot="bento-skeleton"
      className="grid grid-flow-dense auto-rows-[minmax(7.375rem,auto)] grid-cols-1 gap-3 sm:grid-cols-2 min-[940px]:grid-cols-4"
    >
      {BENTO_SPANS.map((span, i) => (
        <div
          key={i}
          className={cn(
            'flex flex-col gap-2 rounded-card border border-border-subtle bg-surface px-[18px] py-4',
            span === 2 && 'sm:col-span-2',
          )}
        >
          <Skeleton className="h-3 w-24 rounded-fw-sm" />
          <Skeleton className="h-7 w-16 rounded-fw-sm" />
          <Skeleton className="mt-auto h-3 w-full rounded-fw-sm" />
        </div>
      ))}
    </div>
  );
}

/** The spine + stage body, without the scope row. */
export function StatsSpineStageBodySkeleton() {
  return (
    <div className="flex flex-col gap-6 min-[940px]:grid min-[940px]:grid-cols-[300px_1fr] min-[940px]:items-start">
      <SpineSkeleton className="min-[940px]:sticky min-[940px]:top-20" />
      <BentoSkeleton />
    </div>
  );
}
