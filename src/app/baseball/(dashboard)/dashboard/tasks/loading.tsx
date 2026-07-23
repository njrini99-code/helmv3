import { Skeleton, SkeletonCard } from '@/components/fairway';
import { fairwayScope } from '@/lib/redesign/flag';

/**
 * Route-level loading skeleton for Tasks (Lane · team ink). Mirrors
 * TasksFairway's real shell — the `fairwayScope` canvas at
 * `max-w-[1100px]`, the SectionMasthead (eyebrow + title + accent rule),
 * and the same `SkeletonCard` list TasksFairway itself renders while its
 * own `loading` state is true — so there is no width/background/chrome
 * jump on navigation.
 */
export default function TasksLoading() {
  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div className="mx-auto w-full max-w-[1100px] px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-3 w-28" />
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-32 rounded-fw-sm" />
          </div>
          <Skeleton className="h-[3px] w-16 rounded-full" />
        </div>

        <div className="mt-6 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
