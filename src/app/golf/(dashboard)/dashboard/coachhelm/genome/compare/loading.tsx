import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';

/**
 * Compare first paint: title + verdict → the two player slots → the stage
 * holding two aligned strands. Mirrors GenomeCompareStrands' spacing.
 */
export default function Loading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="mx-auto flex w-full max-w-[1120px] flex-col px-4 pb-16 pt-4 md:px-8 md:pt-8"
      >
        <span className="sr-only">Loading comparison…</span>
        <Skeleton className="h-8 w-40 md:h-10" />
        <Skeleton className="mt-2 h-5 w-full max-w-[60ch]" />
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Skeleton className="h-14 flex-1 rounded-fw-md" />
          <Skeleton className="h-11 w-16 self-center rounded-full" />
          <Skeleton className="h-14 flex-1 rounded-fw-md" />
        </div>
        <div className="mt-8 rounded-card border border-border-subtle bg-surface px-4 pb-4 pt-4 md:px-6 md:pb-6 md:pt-5">
          <div className="flex items-start justify-between gap-4">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-11 w-[168px] rounded-full" />
          </div>
          <Skeleton className="mt-5 h-4 w-36" />
          <Skeleton className="mt-1 h-[88px] w-full rounded-fw-md" />
          <Skeleton className="my-2 h-8 w-full rounded-fw-md" />
          <Skeleton className="h-4 w-36" />
          <Skeleton className="mt-1 h-[88px] w-full rounded-fw-md" />
        </div>
      </div>
    </div>
  );
}
