import { Skeleton } from '@/components/ui/skeleton';
import { PaperCard, HairlineRule } from '@/components/baseball/living-annual';
import { PIPELINE_STAGES } from '@/lib/recruiting/stages';

const PAGE_SHELL = 'mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8';

// The live board (PipelineClient's `BOARD_STAGES`) renders the four "active"
// lanes as equal columns; `uninterested` moves into a collapsed tray at the
// board's end instead of a 5th equal-weight column. Mirrored here with the
// same filter (not imported — `BOARD_STAGES` isn't exported) so the skeleton
// reserves exactly four column slots, matching the live grid-cols-4 board
// instead of jumping from 5 skeleton columns to 4 real ones on load.
const BOARD_STAGES = PIPELINE_STAGES.filter((s) => s.id !== 'uninterested');

/**
 * Route-level loading skeleton for Pipeline (Lane 4 · THE WAR ROOM, clay ink).
 * Mirrors PipelineClient's masthead + board so there is no legacy `Header`
 * chrome flash on navigation. Columns map over the same `BOARD_STAGES`
 * (four active lanes, `uninterested` excluded) as the live board and reserve
 * its min-h-[520px] so the page doesn't jump height once data lands.
 */
export default function Loading() {
  return (
    <div className={PAGE_SHELL}>
      <div className="flex flex-col gap-3">
        <Skeleton variant="text" width={260} height={11} />
        <div className="flex items-start justify-between gap-4">
          <Skeleton variant="text" width={140} height={36} />
          <Skeleton className="h-9 w-64 rounded-fw-sm" />
        </div>
        <Skeleton className="h-[3px] w-16 rounded-full" />
      </div>

      <div className="mt-8 flex gap-4 overflow-x-auto pb-4 -mx-6 px-6 lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0">
        {BOARD_STAGES.map((s) => (
          <div key={s.id} className="w-[280px] flex-shrink-0 lg:w-auto">
            <PaperCard className="flex h-full min-h-[520px] flex-col p-4">
              <div className="mb-4 flex items-center justify-between gap-2">
                <Skeleton variant="text" width={72} height={11} />
                <Skeleton variant="circular" width={20} height={20} />
              </div>
              <HairlineRule ink="pursuit" className="mb-4" />
              <div className="flex-1 space-y-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-28 w-full rounded-card" />
                ))}
              </div>
            </PaperCard>
          </div>
        ))}
      </div>
    </div>
  );
}
