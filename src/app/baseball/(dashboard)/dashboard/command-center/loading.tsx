import { Skeleton } from '@/components/ui/skeleton';
import { PaperCard } from '@/components/baseball/living-annual';
import { fairwayScope } from '@/lib/redesign/flag';

/**
 * Route-level loading skeleton for the Command Center cover (Lane 1 · THE
 * PRESSBOX, team ink). Mirrors CommandCenterFairway's real first viewport —
 * masthead line + quick actions, the CoverHero cover line, the 4-figure KPI
 * contents strip on ruled baselines, and the brief/aside split (spec:
 * docs/baseball/design-system-living-annual.md §6 P0 #3 "The Command Center
 * Cover") — on the same `fairwayScope` canvas + `max-w-[1400px]` shell as the
 * page itself, so there is no legacy chrome flash on navigation.
 */
export default function CommandCenterLoading() {
  return (
    <div className={fairwayScope('min-h-full')}>
      <div className="mx-auto max-w-[1400px] space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        {/* Masthead line + quick actions */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <Skeleton variant="text" width={200} height={11} />
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-32 rounded-fw-sm" />
            <Skeleton className="h-9 w-32 rounded-fw-sm" />
          </div>
        </div>

        {/* The cover: this week's opponent (CoverHero-height block) */}
        <div className="flex flex-col gap-3">
          <Skeleton variant="text" width={140} height={11} />
          <Skeleton variant="text" width="55%" height={56} className="max-w-lg" />
        </div>

        {/* Masthead contents strip: 4 KPI figures on ruled baselines. Mirrors
            StatStrip's real GRID_BASE[2] + GRID_COLS[4] output byte-for-byte
            (2x2 grid below `sm`, not a single stacked column) so the skeleton
            doesn't visibly reflow when the real KPI strip paints in. */}
        <div className="grid grid-cols-2 gap-x-5 gap-y-6 sm:gap-x-8 sm:gap-y-7 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-1">
              <Skeleton variant="text" width="55%" height={11} />
              <Skeleton variant="text" width="45%" height={40} />
              <Skeleton className="h-[1.5px] w-full" />
            </div>
          ))}
        </div>

        {/* Brief + risk (left) alongside the week strip (aside) */}
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {/* Editor's-letter-shaped brief */}
            <PaperCard className="px-7 py-8">
              <Skeleton className="mb-4 h-[2px] w-14 rounded-full" />
              <Skeleton variant="text" width="60%" height={24} className="mb-3" />
              <div className="max-w-prose space-y-2">
                <Skeleton variant="text" width="100%" height={14} />
                <Skeleton variant="text" width="90%" height={14} />
                <Skeleton variant="text" width="70%" height={14} />
              </div>
            </PaperCard>

            {/* Risk / flag feed rows */}
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <PaperCard key={i} className="p-4">
                  <div className="flex items-start gap-3">
                    <Skeleton variant="circular" width={20} height={20} />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton variant="text" width="45%" height={14} />
                      <Skeleton variant="text" width="75%" height={12} />
                    </div>
                  </div>
                </PaperCard>
              ))}
            </div>
          </div>

          <aside className="space-y-6">
            {/* This week */}
            <PaperCard className="p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <Skeleton variant="text" width={80} height={11} />
                <Skeleton variant="text" width={60} height={11} />
              </div>
              <Skeleton className="mb-4 h-[1.5px] w-full" />
              <div className="space-y-3.5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <Skeleton variant="text" width="70%" height={17} />
                      <Skeleton variant="text" width="40%" height={11} />
                    </div>
                    <Skeleton className="h-5 w-14 rounded-full" />
                  </div>
                ))}
              </div>
            </PaperCard>

            {/* Jump to */}
            <PaperCard className="p-5">
              <Skeleton variant="text" width={60} height={11} className="mb-4" />
              <Skeleton className="mb-4 h-[1.5px] w-full" />
              <div className="flex flex-col gap-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full rounded-fw-sm" />
                ))}
              </div>
            </PaperCard>
          </aside>
        </div>
      </div>
    </div>
  );
}
