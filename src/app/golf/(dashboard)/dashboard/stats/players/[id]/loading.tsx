import { Skeleton } from '@/components/fairway';
import { fairwayScope } from '@/lib/redesign/flag';

export default function Loading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient')}>
      <div className="mx-auto w-full max-w-[1200px] px-4 py-4 md:px-6 md:py-6">
        <div className="flex flex-col gap-10" role="status" aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading player stats…</span>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-16 rounded-fw-sm" />
            <Skeleton className="h-8 w-56 rounded-fw-sm" />
            <Skeleton className="h-4 w-80 max-w-full rounded-fw-sm" />
          </div>
          <Skeleton className="h-56 rounded-card" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Skeleton className="h-24 rounded-card" />
            <Skeleton className="h-24 rounded-card" />
            <Skeleton className="h-24 rounded-card" />
            <Skeleton className="h-24 rounded-card" />
          </div>
          <Skeleton className="h-12 w-full rounded-card" />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Skeleton className="h-28 rounded-card" />
            <Skeleton className="h-28 rounded-card" />
          </div>
        </div>
      </div>
    </div>
  );
}
