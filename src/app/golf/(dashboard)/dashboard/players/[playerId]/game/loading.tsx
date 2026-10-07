import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback';

/**
 * Loading shape for /players/[playerId]/game. It matches the Game Fingerprint's
 * first paint exactly, so the swap is a hard cut with no layout jump:
 *   CoachHelmShell (embedded) breadcrumb row → Segmented tab row →
 *   name (h1) + caption → 2-line verdict → Form line →
 *   "Where the strokes go" rule + 4 waterfall rows + net row →
 *   3 ledger section headers.
 * No cards: the page itself has none. Desktop reflows to the same 5/7 columns.
 */
export function FairwayPlayerGameLoading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div role="status" aria-busy="true" aria-live="polite" className="flex w-full flex-col">
        <span className="sr-only">Loading player game fingerprint…</span>

        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 px-4 pt-2 md:px-6">
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>

        <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6">
          <div className="flex flex-col gap-6">
            <div className="flex w-fit gap-1 rounded-full bg-surface-sunken p-1">
              <Skeleton className="h-8 w-36 rounded-full" />
              <Skeleton className="h-8 w-32 rounded-full" />
            </div>

            <div className="mx-auto flex w-full max-w-[1160px] flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
              <div className="flex flex-col gap-8">
                <div className="flex flex-col gap-3">
                  <Skeleton className="h-10 w-56 max-w-full" />
                  <Skeleton className="h-3 w-44" />
                  <Skeleton className="mt-1 h-5 w-full max-w-[40ch]" />
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="mt-2 h-4 w-52" />
                </div>
                <div>
                  <div className="flex items-baseline justify-between border-b border-border-subtle pb-2">
                    <Skeleton className="h-5 w-44" />
                    <Skeleton className="h-3 w-14" />
                  </div>
                  <div className="flex flex-col pt-7">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="grid h-12 grid-cols-[92px_minmax(0,1fr)_52px] items-center gap-x-3">
                        <Skeleton className="h-3.5 w-20" />
                        <Skeleton className="h-5 w-2/5" />
                        <Skeleton className="ml-auto h-4 w-10" />
                      </div>
                    ))}
                    <div className="grid h-14 grid-cols-[92px_minmax(0,1fr)_52px] items-center gap-x-3 border-t border-border-subtle">
                      <Skeleton className="h-3.5 w-10" />
                      <Skeleton className="h-6 w-1/2" />
                      <Skeleton className="ml-auto h-5 w-12" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-10">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i}>
                    <div className="flex items-baseline justify-between border-b border-border-subtle pb-2">
                      <Skeleton className="h-5 w-32" />
                      <Skeleton className="h-4 w-20" />
                    </div>
                    <Skeleton className="mt-4 h-3 w-full" />
                    <Skeleton className="mt-3 h-3 w-2/3" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Loading() {
  return <FairwayPlayerGameLoading />;
}
