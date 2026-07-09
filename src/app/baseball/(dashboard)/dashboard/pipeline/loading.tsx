import { Skeleton } from '@/components/ui/skeleton';
import { PaperCard, HairlineRule } from '@/components/baseball/living-annual';
import { PIPELINE_STAGES } from '@/lib/recruiting/stages';

const PAGE_SHELL = 'mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8';

/**
 * Route-level loading skeleton for Pipeline (Lane 4 · THE WAR ROOM, clay ink).
 * Mirrors PipelineClient's masthead + board so there is no legacy `Header`
 * chrome flash on navigation. Columns map over the same `PIPELINE_STAGES`
 * source of truth as the live board and reserve its min-h-[520px] so the
 * page doesn't jump height once data lands.
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

      <div className="mt-8 flex gap-4 overflow-x-auto pb-4 -mx-6 px-6 lg:mx-0 lg:grid lg:grid-cols-5 lg:overflow-visible lg:px-0">
        {PIPELINE_STAGES.map((s) => (
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
