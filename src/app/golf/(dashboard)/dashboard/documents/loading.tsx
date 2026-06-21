import { GenericPageSkeleton } from '@/components/ui/skeleton';
import { isRedesignEnabled, fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback';
import { Surface } from '@/components/fairway/surfaces/surface';

/**
 * P433 — purpose-built loading state for the Documents grid (redesign path). The
 * generic 4-card list skeleton did not match FairwayDocuments (max-w-[1100px]
 * ViewHeader masthead → folder tiles → category filter pills + search → a
 * `grid md:grid-cols-2 xl:grid-cols-3` document-card grid), causing a layout
 * swap / CLS on hydrate. This reserves the real slots with Fairway tokens so the
 * grid paints in place. The legacy GenericPageSkeleton stays behind the flag-off
 * fork. isRedesignEnabled() is build-time-inlined and safe in a loading boundary.
 */
function FairwayDocumentsLoading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto w-full max-w-[1100px] px-4 py-6 pb-24 md:px-6 md:py-8"
      >
        <span className="sr-only">Loading documents…</span>

        {/* Masthead — ViewHeader (eyebrow · title · description · meta) + CTAs */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2 h-9 w-56 max-w-full" />
            <Skeleton className="mt-2 h-3.5 w-80 max-w-full" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-10 w-28 rounded-fw-md" />
            <Skeleton className="h-10 w-28 rounded-fw-md" />
          </div>
        </div>

        {/* Folder tiles */}
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Surface key={i} elevation="border" padding="sm" className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 flex-shrink-0 rounded-fw-md" />
              <div className="min-w-0 flex-1">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="mt-1.5 h-3 w-1/3" />
              </div>
            </Surface>
          ))}
        </div>

        {/* Category filter pills + search */}
        <div className="mt-8 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {[64, 80, 72, 88].map((w) => (
              <Skeleton key={w} className="h-9 rounded-full" style={{ width: w }} />
            ))}
          </div>
          <Skeleton className="h-11 w-full max-w-md rounded-fw-md" />
        </div>

        {/* Document-card grid */}
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Surface key={i} elevation="border" padding="md" className="flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <Skeleton className="h-10 w-10 flex-shrink-0 rounded-fw-md" />
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="mt-2 h-3 w-1/2" />
                </div>
              </div>
              <Skeleton className="h-3.5 w-full" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
            </Surface>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Loading() {
  if (isRedesignEnabled()) return <FairwayDocumentsLoading />;
  return <GenericPageSkeleton />;
}
