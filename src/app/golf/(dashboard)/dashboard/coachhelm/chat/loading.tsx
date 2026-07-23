import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback';

export default function Loading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div className="mx-auto max-w-[1536px] px-4 py-6 md:px-6 md:py-8">
        <div role="status" aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading chat…</span>
          <Skeleton className="mb-6 h-10 w-48 rounded-fw-md" />
          <div className="grid grid-cols-12 gap-4 md:gap-6">
            <div className="col-span-12 space-y-2 md:col-span-4 lg:col-span-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 rounded-fw-md" />
              ))}
            </div>
            <Skeleton className="col-span-12 h-[60vh] rounded-card md:col-span-8 lg:col-span-9" />
          </div>
        </div>
      </div>
    </div>
  );
}
