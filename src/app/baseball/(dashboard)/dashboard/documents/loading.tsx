import { Skeleton } from '@/components/ui/skeleton';
import { PaperCard } from '@/components/baseball/living-annual';
import { fairwayScope } from '@/lib/redesign/flag';

/**
 * Route-level loading skeleton for baseball Documents (Lane 1 · THE
 * PRESSBOX, team ink). Mirrors DocumentsFairway's real shell — the
 * SectionMasthead (eyebrow + title + upload action + accent rule + lede),
 * the search + category filter row, and the document card grid — on the
 * same `fairwayScope` canvas + `max-w-[1200px]` shell as the page itself,
 * so there is no width/background jump on navigation.
 */
export default function DocumentsLoading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-3">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-8 w-40" />
            </div>
            <Skeleton className="h-9 w-28 rounded-fw-sm" />
          </div>
          <Skeleton className="h-[3px] w-16 rounded-full" />
          <Skeleton className="h-4 w-56" />
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Skeleton className="h-9 w-full rounded-fw-sm sm:max-w-xs" />
          <div className="flex gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-20 rounded-fw-sm" />
            ))}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <PaperCard key={i} className="p-4" grain={false}>
              <Skeleton className="mb-3 h-10 w-10 rounded" />
              <Skeleton className="mb-2 h-5 w-32" />
              <Skeleton className="h-3 w-24" />
            </PaperCard>
          ))}
        </div>
      </div>
    </div>
  );
}
